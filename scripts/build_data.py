#!/usr/bin/env python3
"""Turn the authored data in data/ into the compact files the app draws.

    npm run data        (= uv run --project scripts python scripts/build_data.py)

Authors write about named regions; this script rasterizes them onto an H3 grid
(resolution 3, ~41,000 cells, oceans included), merges knowledge events and
journey "home knows" events into per-cell change points for every viewpoint,
and checks the data. The build fails if any event, stop or city lacks a source
or confidence, or if a journey does not lift fog for at least one region.
"""
from __future__ import annotations

import base64
import bisect
import csv
import hashlib
import shutil
import json
import math
import sys
import urllib.request
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

import h3
import numpy as np
import shapely
from shapely.geometry import Point, mapping, shape
from shapely.geometry.polygon import orient
from shapely.ops import unary_union

from routes import MODES, Router, crossings, route_journey, stop_times

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = ROOT / "public" / "data"
BASEMAP_SRC = DATA / "basemap"
NE_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/{}.geojson"
NE_FILES = ["ne_50m_land", "ne_50m_lakes", "ne_50m_rivers_lake_centerlines", "ne_50m_antarctic_ice_shelves_polys"]

RES = 3
MAIN_VPS = ["europe", "china", "islam", "polynesia", "india", "japan", "sahel", "mexica", "inca", "persia", "egypt", "arabia", "maghreb", "greece", "rome", "iberia", "france", "britain", "germany", "norse", "russia", "inuit", "zimbabwe", "ethiopia", "swahili", "nusantara"]
ALL_VPS = MAIN_VPS + ["humanity"]
CONFIDENCE = {"high": 0, "medium": 1, "low": 2}
BODIES = {"orbit", "moon"}

errors: list[str] = []
warnings: list[str] = []


def fail(msg: str) -> None:
    errors.append(msg)


def warn(msg: str) -> None:
    warnings.append(msg)


# ── Small parsers ──────────────────────────────────────────────────────────

def read_csv(path: Path) -> list[dict]:
    """CSV with '#' comment lines and blank lines allowed (they keep the files reviewable)."""
    with path.open(encoding="utf-8") as f:
        lines = [ln for ln in f if ln.strip() and not ln.lstrip().startswith("#")]
    rows = []
    for i, row in enumerate(csv.DictReader(lines)):
        row = {k.strip(): (v or "").strip() for k, v in row.items() if k}
        row["_line"] = i + 2
        rows.append(row)
    return rows


@dataclass
class Year:
    mid: float
    lo: float
    hi: float

    @property
    def is_range(self) -> bool:
        return self.lo != self.hi

    def to_json(self):
        return [self.lo, self.hi] if self.is_range else self.lo


def parse_year(text, where: str) -> Year | None:
    if isinstance(text, (int, float)):
        return Year(float(text), float(text), float(text))
    text = str(text).strip()
    if not text:
        return None
    try:
        if ".." in text:
            a, b = (float(x) for x in text.split(".."))
            if b < a:
                a, b = b, a
            return Year((a + b) / 2, a, b)
        v = float(text)
        return Year(v, v, v)
    except ValueError:
        fail(f"{where}: cannot read year {text!r}")
        return None


def b64(arr: np.ndarray) -> str:
    return base64.b64encode(arr.tobytes()).decode("ascii")


def rounded(geom_json, nd=3):
    def r(c):
        if isinstance(c[0], (int, float)):
            return [round(c[0], nd), round(c[1], nd)]
        return [r(x) for x in c]
    return {"type": geom_json["type"], "coordinates": r(geom_json["coordinates"])}


def write_json(name: str, obj) -> int:
    path = OUT / name
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    path.write_text(text, encoding="utf-8")
    return len(text.encode("utf-8"))


# ── Basemap ────────────────────────────────────────────────────────────────

def load_natural_earth() -> dict[str, dict]:
    BASEMAP_SRC.mkdir(parents=True, exist_ok=True)
    out = {}
    for name in NE_FILES:
        path = BASEMAP_SRC / f"{name}.geojson"
        if not path.exists():
            print(f"  downloading {name} …")
            urllib.request.urlretrieve(NE_URL.format(name), path)
        out[name] = json.loads(path.read_text(encoding="utf-8"))
    return out


def build_basemap(ne: dict[str, dict]):
    """Simplify Natural Earth (public domain) into the parchment basemap layers."""
    def polys(fc, tol, keep=lambda p: True):
        feats = []
        for f in fc["features"]:
            if not keep(f["properties"]):
                continue
            g = shape(f["geometry"]).simplify(tol, preserve_topology=True)
            if g.is_empty:
                continue
            parts = list(g.geoms) if g.geom_type == "MultiPolygon" else [g]
            for p in parts:
                if p.area < 0.0004:
                    continue
                feats.append({"type": "Feature", "properties": {}, "geometry": rounded(mapping(orient(p, 1.0)))})
        return {"type": "FeatureCollection", "features": feats}

    land = polys(ne["ne_50m_land"], 0.02)
    ice = polys(ne["ne_50m_antarctic_ice_shelves_polys"], 0.03)
    lakes = polys(ne["ne_50m_lakes"], 0.02, keep=lambda p: (p.get("scalerank") or 0) <= 4)
    rivers = []
    for f in ne["ne_50m_rivers_lake_centerlines"]["features"]:
        p = f["properties"]
        if (p.get("scalerank") or 9) > 5 or p.get("featurecla") not in ("River", "Lake Centerline"):
            continue
        g = shape(f["geometry"]).simplify(0.03)
        if not g.is_empty:
            rivers.append({"type": "Feature", "properties": {"r": p.get("scalerank")}, "geometry": rounded(mapping(g))})
    sizes = {
        "basemap/land.json": write_json("basemap/land.json", land),
        "basemap/ice.json": write_json("basemap/ice.json", ice),
        "basemap/lakes.json": write_json("basemap/lakes.json", lakes),
        "basemap/rivers.json": write_json("basemap/rivers.json", {"type": "FeatureCollection", "features": rivers}),
    }
    return sizes


# ── Grid ───────────────────────────────────────────────────────────────────

@dataclass
class Grid:
    cells: list[str]
    index: dict[str, int]
    lat: np.ndarray
    lon: np.ndarray
    land: np.ndarray
    coastal: np.ndarray
    neighbors: list[list[int]]


def build_grid(ne: dict[str, dict]) -> Grid:
    cells = sorted(c for r0 in h3.get_res0_cells() for c in h3.cell_to_children(r0, RES))
    index = {c: i for i, c in enumerate(cells)}
    n = len(cells)
    lat = np.empty(n)
    lon = np.empty(n)
    for i, c in enumerate(cells):
        lat[i], lon[i] = h3.cell_to_latlng(c)

    landgeom = unary_union(
        [shape(f["geometry"]) for f in ne["ne_50m_land"]["features"]]
        + [shape(f["geometry"]) for f in ne["ne_50m_antarctic_ice_shelves_polys"]["features"]]
    )
    big_lakes = unary_union([shape(f["geometry"]) for f in ne["ne_50m_lakes"]["features"] if (f["properties"].get("scalerank") or 9) <= 1])
    landgeom = landgeom.difference(big_lakes)
    shapely.prepare(landgeom)

    # Sample each cell at its centre and at six points halfway to its corners.
    xs, ys = [lon], [lat]
    for k in range(6):
        vx = np.empty(n)
        vy = np.empty(n)
        for i, c in enumerate(cells):
            b = h3.cell_to_boundary(c)
            vy[i], vx[i] = b[k % len(b)]
        dx = ((vx - lon + 540) % 360) - 180
        xs.append(lon + dx * 0.5)
        ys.append((lat + vy) * 0.5)
    hits = np.zeros(n)
    for x, y in zip(xs, ys):
        hits += shapely.contains_xy(landgeom, x, y)
    frac = hits / 7.0
    land = frac >= 0.5
    neighbors = [[index[nb] for nb in h3.grid_disk(c, 1) if nb != c] for c in cells]
    coastal = np.zeros(n, dtype=bool)
    for i in range(n):
        if 0 < frac[i] < 1 or any(land[j] != land[i] for j in neighbors[i]):
            coastal[i] = True
    return Grid(cells, index, lat, lon, land, coastal, neighbors)


# ── Regions ────────────────────────────────────────────────────────────────

@dataclass
class Region:
    id: str
    name: str
    surface: str
    geom: object | None
    label: tuple[float, float] | None
    body: str | None
    hidden: bool
    area: float = 0.0
    cells: np.ndarray | None = None
    idx: int = 0


WARP_MIN_AREA = 40.0  # square degrees (equal-area); smaller regions are tested exactly


def warp(lon: np.ndarray, lat: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """A smooth, deterministic displacement of about 1.5° with a wavelength of roughly 15°."""
    dx = 1.7 * (0.6 * np.sin(0.35 * lat + 0.12 * lon + 1.3) + 0.4 * np.sin(0.9 * lat - 0.25 * lon + 4.2))
    dy = 1.3 * (0.6 * np.sin(0.33 * lon - 0.1 * lat + 2.1) + 0.4 * np.sin(0.8 * lon + 0.3 * lat + 0.7))
    return lon + dx, np.clip(lat + dy, -89.9, 89.9)


def equal_area(geom) -> float:
    return shapely.transform(geom, lambda c: np.column_stack([c[:, 0] * np.cos(np.radians(c[:, 1])), c[:, 1]])).area


def load_regions(grid: Grid) -> list[Region]:
    fc = json.loads((DATA / "regions.geojson").read_text(encoding="utf-8"))
    regions: list[Region] = []
    seen = set()
    for f in fc["features"]:
        p = f["properties"]
        rid = p.get("id")
        if not rid or rid in seen:
            fail(f"regions.geojson: missing or duplicate id {rid!r}")
            continue
        seen.add(rid)
        geom = shape(f["geometry"]) if f.get("geometry") else None
        if geom is not None and not geom.is_valid:
            fail(f"regions.geojson: {rid} has an invalid polygon")
        surface = p.get("surface", "any")
        if surface not in ("any", "land", "sea", "space"):
            fail(f"regions.geojson: {rid} has unknown surface {surface!r}")
        label = tuple(p["label"]) if p.get("label") else None
        regions.append(Region(rid, p.get("name", rid), surface, geom, label, p.get("body"), bool(p.get("hidden"))))

    n = len(grid.cells)
    # Regions are drawn as coarse polygons; testing every cell at a gently displaced point turns their
    # straight edges into organic frontiers. All regions share the same displacement, so they still tile.
    wlon, wlat = warp(grid.lon, grid.lat)
    for i, r in enumerate(regions):
        r.idx = i
        if r.geom is None:
            if r.body not in BODIES:
                fail(f"regions.geojson: {r.id} has no geometry and is not a body ({sorted(BODIES)})")
            r.cells = np.zeros(0, dtype=np.int32)
            continue
        shapely.prepare(r.geom)
        r.area = equal_area(r.geom)
        tiny = r.area < WARP_MIN_AREA
        xs, ys = (grid.lon, grid.lat) if tiny else (wlon, wlat)
        inside = np.zeros(n, dtype=bool)
        for shift in (0.0, 360.0, -360.0):
            inside |= shapely.contains_xy(r.geom, xs + shift, ys)
        if r.surface == "land":
            inside &= grid.land
        elif r.surface == "sea":
            inside &= ~grid.land
        if not inside.any():
            # Too small to hold a cell centre (Everest, the Challenger Deep): take the cell under its label.
            lon, lat = r.label or (r.geom.representative_point().x, r.geom.representative_point().y)
            lon = ((lon + 180) % 360) - 180
            inside[grid.index[h3.latlng_to_cell(lat, lon, RES)]] = True
        r.cells = np.flatnonzero(inside).astype(np.int32)
        if r.label is None:
            rp = r.geom.representative_point()
            r.label = (rp.x, rp.y)
    return regions


def assign_cells(grid: Grid, regions: list[Region]):
    """Each cell's containing regions, plus its primary (smallest visible) region."""
    n = len(grid.cells)
    member: list[list[int]] = [[] for _ in range(n)]
    for r in regions:
        for c in r.cells:
            member[c].append(r.idx)
    # Cells no visible region covers (inland lakes, small islands, straits) first join the region most
    # of their neighbours belong to, so a lake is part of the land around it…
    def covered(c):
        return any(not regions[i].hidden for i in member[c])

    for _ in range(2):
        adds = []
        for c in range(n):
            if covered(c):
                continue
            votes: dict[int, int] = defaultdict(int)
            for j in grid.neighbors[c]:
                for i in member[j]:
                    if not regions[i].hidden and regions[i].body is None:
                        votes[i] += 1
            if votes:
                adds.append((c, max(votes, key=lambda i: (votes[i], -regions[i].area))))
        for c, i in adds:
            member[c].append(i)
            regions[i].cells = np.append(regions[i].cells, c)
    # …and anything still alone takes the nearest region of the right kind.
    visible = [r for r in regions if r.geom is not None and not r.hidden]
    for kind_land in (True, False):
        pool = [r for r in visible if r.surface in ("any", "land" if kind_land else "sea")]
        tree = shapely.STRtree([r.geom for r in pool])
        for c in range(n):
            if grid.land[c] != kind_land or any(not regions[i].hidden for i in member[c]):
                continue
            pt = Point(grid.lon[c], grid.lat[c])
            j = tree.nearest(pt)
            if j is None:
                continue
            r = pool[int(j)]
            if r.geom.distance(pt) <= (4.0 if kind_land else 3.0):
                member[c].append(r.idx)
                r.cells = np.append(r.cells, c)
    fill_container_gaps(grid, regions, member)
    primary = np.full(n, 0xFFFF, dtype=np.uint16)
    for c in range(n):
        vis = [i for i in member[c] if not regions[i].hidden]
        if vis:
            primary[c] = min(vis, key=lambda i: regions[i].area)
    uncovered = int((primary == 0xFFFF).sum())
    if uncovered:
        warn(f"{uncovered} cells lie outside every named region (open ocean or remote islands)")
    return member, primary


def containment(regions: list[Region], share: float = 0.8) -> dict[int, list[int]]:
    """For each visible region, the larger visible regions that hold at least `share` of its cells."""
    sets = {r.idx: set(int(c) for c in r.cells) for r in regions if not r.hidden and r.body is None and len(r.cells)}
    out: dict[int, list[int]] = defaultdict(list)
    for i, a in sets.items():
        for k, b in sets.items():
            if i != k and len(b) > len(a) and len(a & b) >= share * len(a):
                out[i].append(k)
    return out


def fill_container_gaps(grid: Grid, regions: list[Region], member: list[list[int]]):
    """Land a continent holds but none of its regions covers (the gaps between the Sahara and the Sahel, say)
    would otherwise stand alone as scattered pieces of "Africa", with only the continent's broad knowledge.
    Such cells join the region most of their neighbours belong to, spreading inward until no gap is left."""
    within = containment(regions)
    held: dict[int, int] = defaultdict(int)
    for i, outs in within.items():
        for k in outs:
            held[k] += 1
    containers = {k for k, cnt in held.items() if cnt >= 3}
    def smallest(c):
        vis = [i for i in member[c] if not regions[i].hidden and regions[i].body is None]
        return min(vis, key=lambda i: regions[i].area) if vis else None
    total = 0
    for _ in range(60):
        adds = []
        for c in range(len(member)):
            if not grid.land[c]:
                continue
            s = smallest(c)
            if s is None or s not in containers:
                continue
            votes: dict[int, int] = defaultdict(int)
            for j in grid.neighbors[c]:
                t = smallest(j)
                # A neighbour's region qualifies if it sits inside the same container and takes land.
                if t is not None and t not in containers and s in within.get(t, []) and regions[t].surface != "sea":
                    votes[t] += 1
            if votes:
                adds.append((c, max(votes, key=lambda i: (votes[i], -regions[i].area))))
        if not adds:
            break
        for c, i in adds:
            member[c].append(i)
            regions[i].cells = np.append(regions[i].cells, c)
        total += len(adds)
    # Islands off a continent's regions (no land neighbours) join the nearest one, looking a few rings out.
    for c in range(len(member)):
        if not grid.land[c]:
            continue
        s = smallest(c)
        if s is None or s not in containers:
            continue
        seen, frontier = {c}, [c]
        for _ in range(6):
            nxt = [j for f in frontier for j in grid.neighbors[f] if j not in seen]
            seen.update(nxt)
            hits = [t for j in nxt if (t := smallest(j)) is not None and t not in containers
                    and s in within.get(t, []) and regions[t].surface != "sea"]
            if hits:
                t = max(set(hits), key=hits.count)
                member[c].append(t)
                regions[t].cells = np.append(regions[t].cells, c)
                total += 1
                break
            frontier = nxt
    if total:
        print(f"    {total} land cells between regions joined their neighbours")
    # The reverse gap: coastal regions reach past the continents' coarse outlines (Libya's shore, the coast of
    # Brazil), and open water lies past the named seas (the Great Australian Bight). Those cells join their
    # continent or the nearest sea, or a continent-wide or ocean-wide row would leave them unknown.
    lands = [k for k, cnt in held.items() if cnt >= 2 and regions[k].surface != "sea"]
    # The continents are the outermost containers.
    continents = [k for k in lands if not any(j in lands for j in within.get(k, []))]
    seas = [r.idx for r in regions if r.surface == "sea" and not r.hidden and r.geom is not None]
    # Land only a continent claims (the Pechora shore, between Europe's regions and Asia's) joins the
    # nearest region of either.
    parts = [r.idx for r in regions if r.surface != "sea" and not r.hidden and r.body is None
             and r.geom is not None and r.idx not in containers]
    edges = 0
    # Land past a continent's outline joins the continent that holds the rest of its region; a region no
    # continent holds any of (Iceland) stays out, rather than joining its nearest neighbour (Greenland).
    in_continent = {k: set(int(c) for c in regions[k].cells) for k in continents}
    for c in range(len(member)):
        if not grid.land[c] or any(k in in_continent for k in member[c]):
            continue
        vis = [i for i in member[c] if not regions[i].hidden and regions[i].body is None]
        if not vis:
            continue
        t = min(vis, key=lambda i: regions[i].area)
        share = {k: len(in_continent[k].intersection(int(x) for x in regions[t].cells if grid.land[x])) for k in continents}
        k = max(share, key=share.get)
        if share[k]:
            member[c].append(k)
            regions[k].cells = np.append(regions[k].cells, c)
            edges += 1
    # Water inside a coastal region (the Cape, the Persian Gulf) follows that region; only water no region
    # but a continent claims joins the nearest sea.
    for pool, on_land, skip, reach in ((seas, False, seas + parts, 12.0), (parts, True, parts, 1.0)):
        tree = shapely.STRtree([regions[k].geom for k in pool])
        skip = set(skip)
        for c in range(len(member)):
            if grid.land[c] != on_land or any(k in skip for k in member[c]):
                continue
            # Outlines across the antimeridian run past 180°, so look from the shifted points as well.
            near = []
            for shift in (0.0, 360.0, -360.0):
                pt = Point(grid.lon[c] + shift, grid.lat[c])
                if (j := tree.nearest(pt)) is not None:
                    near.append((regions[pool[int(j)]].geom.distance(pt), pool[int(j)]))
            if not near or min(near)[0] > reach:
                continue
            k = min(near)[1]
            member[c].append(k)
            regions[k].cells = np.append(regions[k].cells, c)
            edges += 1
    if edges:
        print(f"    {edges} cells beyond the continents' and seas' outlines joined the nearest one")


# ── Knowledge ──────────────────────────────────────────────────────────────

@dataclass(order=True)
class Event:
    year: float
    seq: int
    level: int = field(compare=False)
    cap: bool = field(compare=False)
    conf: int = field(compare=False)
    lo: float = field(compare=False)
    hi: float = field(compare=False)
    source: str = field(compare=False)
    note: str = field(compare=False, default="")
    journey: str | None = field(compare=False, default=None)


def vp_by_id(viewpoints: list[dict], vp: str) -> dict:
    return next((v for v in viewpoints if v["id"] == vp), {})


def load_sources() -> dict[str, dict]:
    out = {}
    for row in read_csv(DATA / "sources.csv"):
        if row["id"] in out:
            fail(f"sources.csv:{row['_line']}: duplicate id {row['id']}")
        if not row.get("citation"):
            fail(f"sources.csv:{row['_line']}: {row['id']} has no citation")
        out[row["id"]] = {"citation": row["citation"], **({"url": row["url"]} if row.get("url") else {})}
    return out


def check_ref(where: str, source: str | None, conf: str | None, sources: dict) -> int:
    if not source:
        fail(f"{where}: missing source")
    elif source not in sources:
        fail(f"{where}: unknown source {source!r}")
    if not conf:
        fail(f"{where}: missing confidence")
        return 2
    if conf not in CONFIDENCE:
        fail(f"{where}: confidence must be high, medium or low, not {conf!r}")
        return 2
    return CONFIDENCE[conf]


def load_events(regions_by_id: dict[str, Region], sources: dict, journeys: list[dict]):
    """events[vp][region_id] -> sorted events. vp '*' holds the shared modern rows."""
    events: dict[str, dict[str, list[Event]]] = defaultdict(lambda: defaultdict(list))
    seq = 0
    for row in read_csv(DATA / "knowledge.csv"):
        where = f"knowledge.csv:{row['_line']}"
        vp, rid = row["viewpoint"], row["region"]
        if vp != "*" and vp not in ALL_VPS:
            fail(f"{where}: unknown viewpoint {vp!r}")
            continue
        if rid not in regions_by_id:
            fail(f"{where}: unknown region {rid!r}")
            continue
        y = parse_year(row["year"], where)
        lvl = row["level"]
        cap = lvl.startswith("=")
        try:
            level = int(lvl.lstrip("="))
            assert 0 <= level <= 5
        except (ValueError, AssertionError):
            fail(f"{where}: level must be 0–5 or =0–5, not {lvl!r}")
            continue
        conf = check_ref(where, row["source"], row["confidence"], sources)
        if y is None:
            continue
        seq += 1
        events[vp][rid].append(Event(y.mid, seq, level, cap, conf, y.lo, y.hi, row["source"], row.get("note", "")))
    for j in journeys:
        for k, inf in enumerate(j.get("informs", [])):
            where = f"journeys/{j['id']}.json informs[{k}]"
            vp = inf.get("viewpoint", j["viewpoint"])
            rid = inf.get("region")
            if vp not in ALL_VPS:
                fail(f"{where}: unknown viewpoint {vp!r}")
                continue
            if rid not in regions_by_id:
                fail(f"{where}: unknown region {rid!r}")
                continue
            y = parse_year(inf.get("homeKnows", ""), where)
            if y is None:
                fail(f"{where}: missing homeKnows")
                continue
            # A journey can also set an exact level ("=2"): what it saw of a sub-region, held below the parent's.
            level, exact = inf.get("level"), False
            if isinstance(level, str) and level.startswith("=") and level[1:].isdigit():
                level, exact = int(level[1:]), True
            if not isinstance(level, int) or not 0 <= level <= 5:
                fail(f"{where}: level must be 0–5 or \"=0\"–\"=5\"")
                continue
            src = inf.get("source", j.get("source"))
            conf = check_ref(where, src, inf.get("confidence"), sources)
            seq += 1
            events[vp][rid].append(Event(y.mid, seq, level, exact, conf, y.lo, y.hi, src, inf.get("note", ""), j["id"]))
    for vp in events:
        for rid in events[vp]:
            events[vp][rid].sort()
    return events


class Timeline:
    """Piecewise-constant level for one region and viewpoint."""

    def __init__(self, evs: list[Event]):
        self.evs = evs
        self.years = [e.year for e in evs]

    def at(self, t: float) -> Event | None:
        i = bisect.bisect_right(self.years, t) - 1
        return self.evs[i] if i >= 0 else None


def evaluate(timelines: list[Timeline], t: float) -> tuple[int, int, bool]:
    """Level, confidence and whether an exact ('=n') row decides it, for a cell at year t."""
    floor_level, floor_conf, cap = 0, 0, None
    for tl in timelines:
        e = tl.at(t)
        if e is None:
            continue
        if e.cap:
            if cap is None or e.level < cap.level:
                cap = e
        elif e.level > floor_level or (e.level == floor_level and e.conf > floor_conf and e.level > 0):
            floor_level, floor_conf = e.level, e.conf
    if cap is not None:
        return cap.level, cap.conf, True
    return floor_level, floor_conf, False


def cell_timelines(vp: str, member, regions, events, grid: Grid, raw: bool = False):
    """Per cell, a list of change points [(year, level, conf)] for one viewpoint. `raw` skips the coast rule
    and returns (year, level, conf, capped) with whether an exact row decides each point."""
    tls_by_region: dict[int, list[Timeline]] = {}
    for r in regions:
        tls = []
        if events[vp].get(r.id):
            tls.append(Timeline(events[vp][r.id]))
        if vp in MAIN_VPS and events["*"].get(r.id):
            tls.append(Timeline(events["*"][r.id]))
        tls_by_region[r.idx] = tls

    cache: dict[tuple, tuple[list, bool]] = {}
    out: list[list[tuple[float, int, int]]] = []
    has_cap = np.zeros(len(grid.cells), dtype=bool)
    for c in range(len(grid.cells)):
        sig = tuple(sorted(member[c]))
        if sig not in cache:
            tls = [tl for i in sig for tl in tls_by_region[i]]
            years = sorted({y for tl in tls for y in tl.years})
            changes, prev, any_cap = [], None, False
            for y in years:
                lvl, conf, capped = evaluate(tls, y)
                any_cap |= capped
                key = (lvl, conf, capped) if raw else (lvl, conf)
                if key != (prev or (0, 0, False)[:len(key)]):
                    changes.append((y, lvl, conf, capped) if raw else (y, lvl, conf))
                    prev = key
            cache[sig] = (changes, any_cap)
        changes, any_cap = cache[sig]
        out.append(changes)
        has_cap[c] = any_cap
    if raw:
        return out, has_cap
    RAW_TLS[vp], CAPS[vp] = out, has_cap
    return coast_rule(out, grid, has_cap)


# Each viewpoint's cell histories before the coast rule: a community joins its members' own knowledge, and
# infers its coastal waters once, from the union.
RAW_TLS: dict[str, list] = {}
CAPS: dict[str, np.ndarray] = {}


def learn_from_community(own, coms: list[tuple[list, int, int | None]], grid: Grid, has_cap):
    """Sharing runs both ways: while it belongs to a community, a member also knows what the community knows
    (Britain in 1549 knows Spain as well as Europe does; Roman Alexandria knows the Roman world). What it
    found for itself it keeps, even where the community holds it lower (the Norse knew Vinland; the rest of
    Europe heard a rumour). `coms` holds (community history, from, until) for each membership."""
    out = []
    for c in range(len(grid.cells)):
        years = {y for y, *_ in own[c]}
        for com, start, until in coms:
            years |= {max(y, start) for y, *_ in com[c] if until is None or y < until} | {start} | ({until} if until else set())
        changes, prev = [], (0, 0)
        for y in sorted(years):
            best = max([level_at(own[c], y)] + [level_at(com[c], y) for com, start, until in coms if start <= y and (until is None or y < until)])
            if best != prev:
                changes.append((y, best[0], best[1]))
                prev = best
        out.append(changes)
    return coast_rule(out, grid, has_cap)


def community_timelines(vp: str, members: list[dict], fog_tls: dict, member, regions, events, grid: Grid):
    """A knowledge community (the Islamic world, Europe): its own rows, plus whatever each member knows from
    the year it joins. What one member brings stays known to all until the community's own rows say it was
    lost: where its own level falls (the Latin West forgetting Ptolemy), or an exact ('=n') row holds it down
    (Vinland, known beyond the Norse only as a rumour). After that only what members learn anew brings the
    knowledge back. Before its first member joins, a community shows that member, the forerunner it grew
    from (Arabia before 622)."""
    own, has_cap = cell_timelines(vp, member, regions, events, grid, raw=True)
    members = sorted(members, key=lambda m: m["from"])
    first = members[0]["from"]
    out = []
    for c in range(len(grid.cells)):
        tls = [(m["from"], RAW_TLS[m["viewpoint"]][c]) for m in members]
        ends = [m.get("until") for m in members]
        # A member that leaves (Egypt, from Europe to the Islamic world) adds nothing new after it goes.
        moves = [{y for y, *_ in tl if ends[i] is None or y < ends[i]} for i, (_, tl) in enumerate(tls)]
        years = sorted({y for y, *_ in own[c]} | {y for mv in moves for y in mv} | {start for start, _ in tls})
        held = [(0, 0)] * len(tls)
        changes, prev, k = [], (0, 0), 0
        cur = (0, 0, False)
        for y in years:
            lost = False
            while k < len(own[c]) and own[c][k][0] <= y:
                nxt = own[c][k][1:]
                lost |= own[c][k][0] == y and (nxt[2] or nxt[0] < cur[0])
                cur = nxt
                k += 1
            if y < first:
                fore = level_at(tls[0][1], y)
                best = (cur[0], cur[1]) if cur[2] else max((cur[0], cur[1]), fore)
            else:
                for i, (start, tl) in enumerate(tls):
                    if lost:
                        held[i] = min(held[i], (cur[0], cur[1]))
                    elif y >= start and (y == start or y in moves[i]):
                        held[i] = max(held[i], level_at(tl, y))
                best = (cur[0], cur[1]) if cur[2] else max([(cur[0], cur[1]), *held])
            if best != prev:
                changes.append((y, best[0], best[1]))
                prev = best
        out.append(changes)
    RAW_TLS[vp] = out
    return coast_rule(out, grid, has_cap)


def level_at(changes, t):
    lvl, conf = 0, 0
    for y, l, c in changes:
        if y > t:
            break
        lvl, conf = l, c
    return lvl, conf


def coast_rule(tls, grid: Grid, has_cap):
    """Knowing a shore means knowing the water just off it: coastal sea >= min(neighbouring land, 3)."""
    out = list(tls)
    for c in range(len(tls)):
        if grid.land[c] or not grid.coastal[c] or has_cap[c]:
            continue
        nbs = [j for j in grid.neighbors[c] if grid.land[j]]
        if not nbs:
            continue
        years = sorted({y for j in [c, *nbs] for y, _, _ in tls[j]})
        changes, prev = [], (0, 0)
        for y in years:
            own = level_at(tls[c], y)
            best = own
            for j in nbs:
                l, cf = level_at(tls[j], y)
                l = min(l, 3)
                if l > best[0]:
                    best = (l, cf)
            if best != prev:
                changes.append((y, best[0], best[1]))
                prev = best
        out[c] = changes
    return out


def encode_fog(vp: str, tls) -> tuple[dict, list]:
    patterns: dict[tuple, int] = {}
    ids = np.zeros(len(tls), dtype=np.uint16)
    for c, changes in enumerate(tls):
        key = tuple((round(y, 1), l, cf) for y, l, cf in changes)
        if key not in patterns:
            patterns[key] = len(patterns)
        ids[c] = patterns[key]
    if len(patterns) > 0xFFFF:
        fail(f"{vp}: too many distinct cell histories ({len(patterns)})")
    flat = [[v for ch in key for v in (ch[0], ch[1], ch[2])] for key in patterns]
    return {"vp": vp, "patterns": flat, "cells": b64(ids)}, list(patterns)


# ── Journeys, cities, names ────────────────────────────────────────────────

def check_route_sanity(router, j):
    """Flag legs that look wrong: a sea leg far longer than an open-water straight line (a bad snap or a
    passage through ice), or a land/river leg that runs over open sea. Legs shaped by waypoints are the
    author's choice and are not checked."""
    real = [st for st in j["stops"] if not st.get("waypoint")]
    has_waypoints, pending = set(), False
    idx = -1
    for st in j["stops"]:
        if st.get("waypoint"):
            pending = True
            continue
        idx += 1
        if pending:
            has_waypoints.add(idx)
        pending = False
    for i, (r, mode) in enumerate(zip(j["_routes"], j["_modes"])):
        if not r or mode in (None, "direct") or i in has_waypoints:
            continue
        L = sum(haversine_km(a[1], a[0], b[1], b[0]) for a, b in zip(r, r[1:]))
        straight = haversine_km(r[0][1], r[0][0], r[-1][1], r[-1][0])
        where = f"journeys/{j['id']}.json stop {i} ({real[i].get('place')})"
        year = real[i].get("year", 0)
        if mode == "sea" and L > 1.6 * straight + 600 and router.water_fraction(r[0], r[-1], year) > 0.7:
            warn(f"{where}: sea route is {L:.0f} km for {straight:.0f} km of open water; check its mode or add waypoints")
        if mode == "sea" and L > 2.5 * straight + 800 and router.water_fraction(r[0], r[-1], year) < 0.3:
            warn(f"{where}: sea route is {L:.0f} km between places {straight:.0f} km apart over land; should it be by land or river?")
        if mode in ("land", "river"):
            land = router.is_land(year)
            wet = sum(not land[router.cell(x, y)] for x, y in r) / len(r)
            if wet > 0.5 and straight > 150:
                warn(f"{where}: {mode} route runs {wet:.0%} over water; should it be by sea?")


def load_journeys(sources: dict, vp_ids: set[str]) -> list[dict]:
    journeys = []
    for path in sorted((DATA / "journeys").glob("*.json")):
        j = json.loads(path.read_text(encoding="utf-8"))
        where = f"journeys/{path.name}"
        if j.get("id") != path.stem:
            fail(f"{where}: id must match the file name")
        if j.get("viewpoint") not in vp_ids:
            fail(f"{where}: unknown viewpoint {j.get('viewpoint')!r}")
        stops = [s for s in j.get("stops", []) if not s.get("waypoint")]
        if len(stops) < 2:
            fail(f"{where}: needs at least two stops")
        places = set()
        last_year = -math.inf
        for k, s in enumerate(j.get("stops", [])):
            w = f"{where} stops[{k}]"
            if s.get("from") and s["from"] not in places:
                fail(f"{w}: 'from' names {s['from']!r}, which is not an earlier stop")
            if s.get("waypoint"):
                if "lat" not in s or "lon" not in s:
                    fail(f"{w}: waypoint needs lat and lon")
                continue
            for key in ("year", "place", "note"):
                if key not in s:
                    fail(f"{w}: missing {key}")
            if s.get("by") not in (None, *MODES):
                fail(f"{w}: 'by' must be one of {', '.join(MODES)}")
            if s.get("body") not in (None, "orbit", "moon", "moon-orbit"):
                fail(f"{w}: unknown body {s.get('body')!r}")
            if s.get("body") in (None, "orbit") and ("lat" not in s or "lon" not in s):
                if s.get("body") is None:
                    fail(f"{w}: an Earth stop needs lat and lon")
            check_ref(w, s.get("source", j.get("source")), s.get("confidence", j.get("confidence")), sources)
            if s.get("year", 0) < last_year:
                fail(f"{w}: stops must be in time order")
            last_year = s.get("year", last_year)
            places.add(s["place"])
        if j.get("by") not in (None, *MODES):
            fail(f"{where}: 'by' must be one of {', '.join(MODES)}")
        if not j.get("informs") and j.get("lifts") is not False:
            fail(f"{where}: must inform at least one viewpoint about at least one region (or say \"lifts\": false)")
        journeys.append(j)
    return journeys


def load_names(regions_by_id, city_ids, vp_ids, sources):
    names: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for row in read_csv(DATA / "names.csv"):
        where = f"names.csv:{row['_line']}"
        kind, oid, vp = row["kind"], row["id"], row["viewpoint"]
        if kind == "region" and oid not in regions_by_id:
            fail(f"{where}: unknown region {oid!r}")
        elif kind == "city" and oid not in city_ids:
            fail(f"{where}: unknown city {oid!r}")
        elif kind not in ("region", "city"):
            fail(f"{where}: kind must be region or city")
        if vp != "*" and vp not in vp_ids:
            fail(f"{where}: unknown viewpoint {vp!r}")
        if row.get("source") and row["source"] not in sources:
            fail(f"{where}: unknown source {row['source']!r}")
        entry = {"vp": vp, "name": row["name"]}
        if row.get("native"):
            entry["native"] = row["native"]
        if row.get("from"):
            entry["from"] = int(row["from"])
        if row.get("to"):
            entry["to"] = int(row["to"])
        if row.get("source"):
            entry["source"] = row["source"]
        names[(kind, oid)].append(entry)
    return names


def haversine_km(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(a))


def load_cities(sources, grid: Grid):
    """Cities, then landmarks: built or natural places that share the cities' lifecycle, names and cards."""
    cities = []
    seen = set()
    rows = [("cities.csv", r) for r in read_csv(DATA / "cities.csv")]
    rows += [("landmarks.csv", r) for r in read_csv(DATA / "landmarks.csv")]
    for file, row in rows:
        where = f"{file}:{row['_line']}"
        kind = row.get("kind") or None
        if kind not in (None, "built", "natural"):
            fail(f"{where}: kind must be built or natural")
        cid = row["id"]
        if cid in seen:
            fail(f"{where}: duplicate city {cid}")
        seen.add(cid)
        lat, lon = float(row["lat"]), float(row["lon"])
        tier = int(row["tier"])
        if tier not in (1, 2, 3):
            fail(f"{where}: tier must be 1, 2 or 3")
        dates = {}
        for key in ("founded", "peak", "abandoned", "forgotten", "rediscovered"):
            y = parse_year(row.get(key, ""), f"{where} {key}")
            if y is not None:
                dates[key] = y
        # Only a natural landmark has always been there.
        if "founded" not in dates and kind != "natural":
            fail(f"{where}: missing founded date")
        order = [dates[k].mid for k in ("founded", "abandoned", "forgotten", "rediscovered") if k in dates]
        if order != sorted(order):
            fail(f"{where}: founded ≤ abandoned ≤ forgotten ≤ rediscovered must hold")
        check_ref(where, row["source"], row["confidence"], sources)
        city = {
            "id": cid, "lat": lat, "lon": lon, "tier": tier,
            "cell": grid.index[h3.latlng_to_cell(lat, lon, RES)],
            "dates": {k: v.to_json() for k, v in dates.items()},
            "mid": {k: v.mid for k, v in dates.items()},
            "source": row["source"], "confidence": row["confidence"],
        }
        if kind:
            city["kind"] = kind
        subtype = row.get("subtype") or None
        if subtype and (kind != "natural" or subtype not in ("peak", "volcano", "falls", "gorge", "rock", "water")):
            fail(f"{where}: subtype must be peak, volcano, falls, gorge, rock or water, on a natural landmark")
        elif subtype:
            city["subtype"] = subtype
        # found: "europe 1855 russia 1643". A landmark one viewpoint came upon only long after it knew the
        # country around it (Victoria Falls, in a Zambezi Europe had heard of since the Portuguese).
        if kind:
            widely = parse_year(row.get("widely", ""), f"{where} widely")
            if widely is None:
                fail(f"{where}: a landmark needs a 'widely' year, when it became known beyond its neighbours")
            else:
                city["widely"] = round(widely.mid)
        if row.get("found"):
            parts = row["found"].split()
            if len(parts) % 2 or not kind:
                fail(f"{where}: found must be pairs of 'viewpoint year', on a landmark")
            else:
                city["found"] = {parts[i]: int(parts[i + 1]) for i in range(0, len(parts), 2)}
        if row.get("story"):
            city["story"] = row["story"]
        cities.append(city)
    return cities


DEPICTION_FORMATS = (".webp", ".png", ".jpg", ".jpeg")
# The sizes the site serves: the strip of eras, the card, and the enlarged view.
DEPICTION_SIZES = {"thumb": 200, "card": 720, "full": 1280}
# What each kind of subject holds: a city has eras in time, from one fixed view; a journey has scenes,
# each pinned to one of its stops; inventions have standalone studies.
DEPICTION_KINDS = {"city": "eras", "journey": "scenes", "invention": "studies"}


def depiction_image(src: Path, out_dir: Path, item: str) -> dict[str, str]:
    """Write the three served sizes of one picture (skipping those already newer than the source)."""
    from PIL import Image

    out = {}
    if src.suffix == ".svg":
        dst = out_dir / f"{item}.svg"
        shutil.copyfile(src, dst)
        return {k: dst.name for k in DEPICTION_SIZES}
    img = None
    for size, width in DEPICTION_SIZES.items():
        dst = out_dir / f"{item}.{size}.webp"
        out[size] = dst.name
        if dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime:
            continue
        if img is None:
            img = Image.open(src).convert("RGB")
        im = img if img.width <= width else img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
        im.save(dst, "WEBP", quality=72 if size == "thumb" else 80, method=6)
    return out


def load_depictions(sources, vp_ids, subjects: dict) -> dict[str, dict[str, int]]:
    """Imagined sketches: city eras, journey scenes, or standalone invention studies.

    data/depictions/style.json                     the drawing style for each kind
    data/depictions/<kind>/<id>/subject.json       city: the fixed `view` and `eras` (from/to years)
                                                   journey: the `traveller` and `scenes` (each at a stop)
                                                   invention: `studies` of the object or process
    data/depictions/<kind>/<id>/<item>.webp|png|jpg  the accepted picture (or <item>.placeholder.svg)
    data/depictions/<kind>/<id>/<item>.json          how it was made

    `subjects` maps each kind to its valid ids (for journeys, id -> its stops). Writes
    public/data/depictions/<kind>/<id>.json (fetched when needed) and each picture in three sizes under
    public/data/depictions/<kind>/<id>/. Returns {kind: {id: number of pictures}}.
    """
    root = DATA / "depictions"
    out_root = OUT / "depictions"
    counts: dict[str, dict[str, int]] = defaultdict(dict)
    styles = json.loads((root / "style.json").read_text(encoding="utf-8")).get("styles", {}) if (root / "style.json").exists() else {}
    for kind in DEPICTION_KINDS:
        if not styles.get(kind):
            fail(f"data/depictions/style.json: no style for {kind!r}")
    written = set()
    for subject_file in sorted(root.glob("*/*/subject.json")):
        kind, sid = subject_file.parent.parent.name, subject_file.parent.name
        where = f"depictions/{kind}/{sid}"
        if kind not in DEPICTION_KINDS:
            fail(f"{where}: unknown kind {kind!r} (supported: {', '.join(DEPICTION_KINDS)})")
            continue
        if sid not in subjects[kind]:
            fail(f"{where}: unknown {kind} {sid!r}")
            continue
        doc = json.loads(subject_file.read_text(encoding="utf-8"))
        list_key = DEPICTION_KINDS[kind]
        if kind == "city" and not doc.get("view"):
            fail(f"{where}: describe the fixed 'view' every era is drawn from")
        if kind == "journey" and not doc.get("traveller"):
            fail(f"{where}: describe the 'traveller' so every scene draws them alike")
        out_dir = out_root / kind / sid
        out_dir.mkdir(parents=True, exist_ok=True)
        items = []
        entries = doc.get(list_key, [])
        ids = [e.get("id") for e in entries]
        for k, e in enumerate(entries):
            w = f"{where} {list_key}[{k}] {e.get('id')!r}"
            needed = ("id", "title", "caption", "sources", "confidence", "prompt") + ({"city": ("from",), "journey": ("stop", "place"), "invention": ()}[kind])
            for key in needed:
                if key not in e:
                    fail(f"{w}: missing {key}")
            if ids.count(e.get("id")) > 1:
                fail(f"{w}: duplicate id")
            if kind == "city" and "to" in e and e["to"] < e.get("from", 0):
                fail(f"{w}: 'to' is before 'from'")
            if kind == "journey":
                stops = subjects["journey"][sid]
                i = e.get("stop", -1)
                if not (0 <= i < len(stops)):
                    fail(f"{w}: stop {i} is out of range (the journey has {len(stops)} stops, counted from 0, waypoints skipped)")
                elif stops[i].get("place") != e.get("place"):
                    fail(f"{w}: stop {i} is {stops[i].get('place')!r}, not {e.get('place')!r}")
            for ref in ("base", "ref"):
                if e.get(ref) and e[ref] not in ids:
                    fail(f"{w}: {ref} {e[ref]!r} is not in {sid}")
            for vp in e.get("captions", {}):
                if vp not in vp_ids:
                    fail(f"{w}: caption for unknown viewpoint {vp!r}")
            for src_id in e.get("sources") or [None]:
                check_ref(w, src_id, e.get("confidence"), sources)
            folder = subject_file.parent
            image = next((folder / f"{e['id']}{x}" for x in DEPICTION_FORMATS if (folder / f"{e['id']}{x}").exists()), None)
            placeholder = image is None
            if placeholder:
                image = folder / f"{e['id']}.placeholder.svg"
                if not image.exists():
                    fail(f"{w}: no picture (looked for {e['id']}.webp/.png/.jpg or .placeholder.svg)")
                    continue
            files = depiction_image(image, out_dir, e["id"])
            written.update(out_dir / f for f in files.values())
            rec = {k: e[k] for k in ("id", "from", "to", "stop", "place", "title", "caption", "captions", "sources", "confidence") if k in e}
            rec["img"] = {size: f"depictions/{kind}/{sid}/{name}" for size, name in files.items()}
            if placeholder:
                rec["placeholder"] = True
            made = folder / f"{e['id']}.json"
            if made.exists() and not placeholder:
                m = json.loads(made.read_text(encoding="utf-8"))
                rec["made"] = {k: m[k] for k in ("provider", "model", "date") if k in m}
            items.append(rec)
        if kind == "city":
            items.sort(key=lambda r: r["from"])
            for a, b in zip(items, items[1:]):
                if a.get("to", math.inf) >= b["from"]:
                    fail(f"{where}: eras {a['id']} and {b['id']} overlap in time")
        elif kind == "journey":
            # Python's stable sort preserves authored page order within each stop.
            items.sort(key=lambda r: r["stop"])
        if items:
            write_json(f"depictions/{kind}/{sid}.json", {"kind": kind, "id": sid, list_key: items})
            written.add(out_root / kind / f"{sid}.json")
            counts[kind][sid] = len(items)
    # Drop anything left from subjects or pictures that no longer exist.
    if out_root.exists():
        for f in sorted(out_root.rglob("*"), reverse=True):
            if f.is_file() and f not in written:
                f.unlink()
            elif f.is_dir() and not any(f.iterdir()):
                f.rmdir()
    return counts


MONTHS_EN = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]


def zh_date(text: str) -> str | None:
    """'27 December 1831' → 1831年12月27日; 'May 1854' → 1854年5月."""
    import re
    m = re.fullmatch(r"(?:(\d{1,2}) )?([A-Za-z]+) (-?\d+)", text.strip())
    if not m or m.group(2).lower() not in MONTHS_EN:
        return None
    y, mo = int(m.group(3)), MONTHS_EN.index(m.group(2).lower()) + 1
    year = f"公元前{-y}年" if y < 0 else f"{y}年"
    return f"{year}{mo}月{int(m.group(1))}日" if m.group(1) else f"{year}{mo}月"


def load_translations(journeys, regions_by_id, inventions, vp_ids, viewpoints, city_ids, events) -> dict | None:
    """Chinese for the data (data/i18n/zh/): checked against what it translates, bundled into one file the
    app fetches when the reader switches to Chinese. Anything missing stays English in the app."""
    root = DATA / "i18n" / "zh"
    if not root.exists():
        return None
    rd = lambda name: json.loads((root / name).read_text(encoding="utf-8")) if (root / name).exists() else {}
    cjk = lambda t: any("㐀" <= ch <= "鿿" for ch in t)
    stats = {}

    # Names: what anyone called a place, plus stop and home places. Viewpoints that wrote in Chinese
    # characters already give their own.
    names = rd("names.json")
    known = set()
    for row in read_csv(DATA / "names.csv"):
        known.add(row["name"])
        if row["name"] not in names and row.get("native") and cjk(row["native"]):
            names[row["name"]] = row["native"]
    for v in viewpoints:
        for hm in v["homes"]:
            known.add(hm["place"])
    for j in journeys:
        for st in j["stops"]:
            if st.get("place"):
                known.add(st["place"])
    for k in names:
        if k not in known:
            warn(f"i18n/zh/names.json: {k!r} is not a name used anywhere")
    listed = {row["name"] for row in read_csv(DATA / "names.csv")} | {hm["place"] for v in viewpoints for hm in v["homes"]}
    stats["names"] = (sum(1 for k in listed if k in names), len(listed))

    regions = rd("regions.json")
    for k in regions:
        if k not in regions_by_id:
            fail(f"i18n/zh/regions.json: unknown region {k!r}")
    stats["regions"] = (len(regions), len([r for r in regions_by_id.values()]))

    jz = {}
    jby = {j["id"]: j for j in journeys}
    stop_total = stop_done = 0
    for f in sorted((root / "journeys").glob("*.json")):
        jid = f.stem
        if jid not in jby:
            fail(f"i18n/zh/journeys/{f.name}: unknown journey")
            continue
        d = json.loads(f.read_text(encoding="utf-8"))
        real = [st for st in jby[jid]["stops"] if not st.get("waypoint")]
        stops = d.get("stops", {})
        for k in stops:
            if not (k.isdigit() and int(k) < len(real)):
                fail(f"i18n/zh/journeys/{f.name}: stop {k} out of range (the journey has {len(real)} stops)")
        for i, st in enumerate(real):
            if st.get("date"):
                z = zh_date(st["date"])
                if z:
                    stops.setdefault(str(i), {})["date"] = z
        stop_done += sum(1 for v in stops.values() if v.get("note"))
        d["stops"] = stops
        jz[jid] = d
    stop_total = sum(len([st for st in j["stops"] if not st.get("waypoint")]) for j in journeys)
    stats["journeys"] = (len(jz), len(journeys))
    stats["stop notes"] = (stop_done, stop_total)

    inv = rd("inventions.json")
    inv_ids = {x["id"] for x in inventions}
    for k in inv:
        if k not in inv_ids:
            fail(f"i18n/zh/inventions.json: unknown invention {k!r}")
    stats["inventions"] = (len(inv), len(inv_ids))

    vps = rd("viewpoints.json")
    for k in vps:
        if k not in vp_ids:
            fail(f"i18n/zh/viewpoints.json: unknown viewpoint {k!r}")
    for k in vp_ids:
        if not vps.get(k, {}).get("tagline"):
            warn(f"i18n/zh/viewpoints.json: {k} has no Chinese tagline")
    moments = rd("moments.json")
    all_moments = {m["label"] for v in viewpoints for m in v.get("moments", [])}
    for k in moments:
        if k not in all_moments:
            warn(f"i18n/zh/moments.json: {k!r} is not a key moment")
    stats["moments"] = (len(moments), len(all_moments))

    dep = rd("depictions.json")
    for subj, items in dep.items():
        sf = DATA / "depictions" / subj / "subject.json"
        if not sf.exists():
            fail(f"i18n/zh/depictions.json: unknown subject {subj!r}")
            continue
        doc = json.loads(sf.read_text(encoding="utf-8"))
        ids = {e["id"] for e in doc.get("eras", []) + doc.get("scenes", []) + doc.get("studies", [])}
        for k in items:
            if k not in ids:
                fail(f"i18n/zh/depictions.json: {subj} has no {k!r}")

    stories = rd("stories.json")
    for k in stories:
        if k not in city_ids:
            fail(f"i18n/zh/stories.json: unknown city {k!r}")

    phases = rd("phases.json")
    for k in phases:
        lid, _, pid = k.partition("/")
        if lid not in city_ids:
            fail(f"i18n/zh/phases.json: unknown landmark {lid!r}")

    notes = rd("notes.json")
    all_notes = {e.note for d in events.values() for lst in d.values() for e in lst if e.note}
    for k in notes:
        if k not in all_notes:
            warn(f"i18n/zh/notes.json: {k!r} is not a note on any event")
    stats["event notes"] = (sum(1 for n in all_notes if n in notes), len(all_notes))

    # Characters the map's labels can show, for its font atlas.
    label_text = list(names.values()) + list(regions.values()) + [x.get("name", "") for x in inv.values()] + [x.get("name", "") for x in jz.values()]
    chars = "".join(sorted({ch for t in label_text for ch in t if ord(ch) > 0x2e80}))
    print("    中文: " + " · ".join(f"{k} {a}/{b}" for k, (a, b) in stats.items()))
    series = rd("series.json")
    return {"series": series, "names": names, "regions": regions, "journeys": jz, "inventions": inv, "viewpoints": vps, "moments": moments,
            "depictions": dep, "stories": stories, "phases": phases, "notes": notes, "chars": chars}


INVENTION_CATEGORIES = ("navigation", "measurement", "mapping", "communication", "transport", "imaging")


def load_inventions(sources, vp_ids):
    """Tools and ideas that let people see or reach more of the world. `culture` is a viewpoint id where
    one fits, otherwise a plain name (e.g. "United States")."""
    out = []
    seen = set()
    for k, inv in enumerate(json.loads((DATA / "inventions.json").read_text(encoding="utf-8"))):
        where = f"inventions.json[{k}] {inv.get('id')!r}"
        for key in ("id", "year", "name", "place", "lat", "lon", "culture", "category", "summary", "changed"):
            if key not in inv:
                fail(f"{where}: missing {key}")
        if inv.get("id") in seen:
            fail(f"{where}: duplicate id")
        seen.add(inv.get("id"))
        if inv.get("category") not in INVENTION_CATEGORIES:
            fail(f"{where}: category must be one of {', '.join(INVENTION_CATEGORIES)}")
        if not (-90 <= inv.get("lat", 0) <= 90 and -180 <= inv.get("lon", 0) <= 180):
            fail(f"{where}: lat/lon out of range")
        check_ref(where, inv.get("source"), inv.get("confidence"), sources)
        y = parse_year(inv.get("year", ""), where)
        if y is None:
            continue
        doc = dict(inv)
        doc["year"] = y.to_json()
        doc["mid"] = y.mid
        if inv.get("culture") in vp_ids:
            doc["vp"] = inv["culture"]
            del doc["culture"]
        out.append(doc)
    out.sort(key=lambda d: d["mid"])
    return out


# ── Main ───────────────────────────────────────────────────────────────────

def main() -> int:
    print("The World We Know — data build")
    sources = load_sources()
    viewpoints = json.loads((DATA / "viewpoints.json").read_text(encoding="utf-8"))
    vp_ids = {v["id"] for v in viewpoints}
    if vp_ids != set(ALL_VPS):
        fail(f"viewpoints.json must define exactly {ALL_VPS}")
    communities = {}
    for v in viewpoints:
        # A knowledge community shares what its members know from the year each joins (the Islamic world).
        if "community" in v:
            ms = v["community"].get("members", [])
            if not ms or any(m.get("viewpoint") not in MAIN_VPS or m.get("viewpoint") == v["id"] or "community" in vp_by_id(viewpoints, m.get("viewpoint"))
                             or not isinstance(m.get("from"), int) or not isinstance(m.get("until", 0), int) for m in ms):
                fail(f"viewpoints.json: {v['id']} community members must be other viewpoints, each with a 'from' year")
            communities[v["id"]] = ms
        if not v.get("tagline"):
            fail(f"viewpoints.json: {v['id']} needs a one-sentence tagline")
        if v["id"] in MAIN_VPS and len(v.get("moments", [])) < 8:
            fail(f"viewpoints.json: {v['id']} needs at least 8 key moments")
        for m in v.get("moments", []):
            if m.get("source") not in sources:
                fail(f"viewpoints.json: {v['id']} moment {m.get('label')!r} has no known source")

    print("  basemap …")
    ne = load_natural_earth()
    sizes = build_basemap(ne)
    print("  grid …")
    grid = build_grid(ne)
    print(f"    {len(grid.cells)} cells, {int(grid.land.sum())} land, {int(grid.coastal.sum())} coastal")
    print("  regions …")
    regions = load_regions(grid)
    regions_by_id = {r.id: r for r in regions}
    member, primary = assign_cells(grid, regions)

    journeys = load_journeys(sources, vp_ids)
    events = load_events(regions_by_id, sources, journeys)
    cities = load_cities(sources, grid)
    # Landmarks that run along a line (a wall, a canal) carry their course.
    by_id = {c["id"]: c for c in cities}
    good = lambda path: len(path) >= 2 and all(len(p) == 2 for p in path)
    rounded = lambda path: [[round(x, 3) for x in p] for p in path]
    for lid, line in json.loads((DATA / "landmark-paths.json").read_text(encoding="utf-8")).items():
        where = f"landmark-paths.json: {lid}"
        if not by_id.get(lid, {}).get("kind"):
            fail(f"{where} is not a landmark")
        elif line.get("style") not in ("wall", "canal", "river"):
            fail(f"{where} style must be wall, canal or river")
        elif "phases" in line:
            # A landmark built, abandoned and rebuilt along new lines (the Great Wall): each phase has its years,
            # the courses it built (none, if it let the old ones fall), and where its mark stands.
            phases = []
            for ph in line["phases"]:
                if not all(k in ph for k in ("id", "name", "from", "anchor", "note")) or not all(good(p) for p in ph.get("paths", [])):
                    fail(f"{where}: each phase needs id, name, from, anchor, note, and [lon, lat] paths")
                    continue
                if ph.get("idle") == bool(ph.get("paths")):
                    fail(f"{where} {ph['id']}: a phase either builds paths or is idle")
                phases.append({**ph, "paths": [rounded(p) for p in ph.get("paths", [])]})
            if [p["from"] for p in phases] != sorted(p["from"] for p in phases):
                fail(f"{where}: phases must run in order")
            # What becomes of an age's works when it ends: walls stand as fading ruins, a canal silts up and is gone.
            if line.get("ended", "fade") not in ("fade", "vanish"):
                fail(f"{where}: ended must be fade or vanish")
            by_id[lid]["path"] = {"style": line["style"], "ended": line.get("ended", "fade"), "phases": phases}
        elif not good(line.get("path", [])):
            fail(f"{where} needs two or more [lon, lat] points")
        else:
            by_id[lid]["path"] = {"style": line["style"], "points": rounded(line["path"])}
    for c in cities:
        found = c.get("found", {})
        for vp in found:
            if vp not in vp_ids:
                fail(f"landmarks.csv: {c['id']} found by unknown viewpoint {vp!r}")
        # What a knowledge community came upon, its members learned with it, unless they have a date of their own.
        for v in viewpoints:
            if v["id"] in found:
                for m in v.get("community", {}).get("members", []):
                    found.setdefault(m["viewpoint"], found[v["id"]])
    inventions = load_inventions(sources, vp_ids)
    names = load_names(regions_by_id, {c["id"] for c in cities}, vp_ids, sources)
    for c in cities:
        if not any(n["vp"] == "*" for n in names.get(("city", c["id"]), [])):
            fail(f"names.csv: city {c['id']} has no default (*) name")

    print("  fog …")
    fog_tls = {}
    for vp in sorted(ALL_VPS, key=lambda v: v in communities):
        if vp in communities:
            fog_tls[vp] = community_timelines(vp, communities[vp], fog_tls, member, regions, events, grid)
        else:
            fog_tls[vp] = cell_timelines(vp, member, regions, events, grid)
    # What each viewpoint found out for itself, before members learn from their communities: a journey must
    # lift the fog of the viewpoint that sent it.
    own_tls = dict(fog_tls)
    belongs: dict[str, list] = defaultdict(list)
    for com, ms in communities.items():
        for m in ms:
            belongs[m["viewpoint"]].append((RAW_TLS[com], m["from"], m.get("until")))
    for vp, coms in belongs.items():
        fog_tls[vp] = learn_from_community(RAW_TLS[vp], coms, grid, CAPS[vp])
    for vp in ALL_VPS:
        tls = fog_tls[vp]
        doc, pats = encode_fog(vp, tls)
        sizes[f"fog/{vp}.json"] = write_json(f"fog/{vp}.json", doc)
        print(f"    {vp}: {len(pats)} distinct cell histories")

    # Bodies beyond Earth are a single "cell" each, drawn in the inset.
    beyond = {}
    for r in regions:
        if r.body in BODIES:
            beyond[r.id] = {}
            for vp in ALL_VPS:
                tls = [Timeline(events[vp][r.id])] if events[vp].get(r.id) else []
                if vp in MAIN_VPS and events["*"].get(r.id):
                    tls.append(Timeline(events["*"][r.id]))
                years = sorted({y for tl in tls for y in tl.years})
                changes, prev = [], 0
                for y in years:
                    lvl, conf, _ = evaluate(tls, y)
                    if lvl != prev:
                        changes.append([y, lvl, conf])
                        prev = lvl
                beyond[r.id][vp] = changes

    # Every journey must lift fog somewhere when its news reaches home.
    for j in journeys:
        lifted = []
        for inf in j.get("informs", []):
            vp = inf.get("viewpoint", j["viewpoint"])
            r = regions_by_id.get(inf.get("region"))
            y = parse_year(inf.get("homeKnows", ""), j["id"])
            if r is None or y is None:
                continue
            if r.body in BODIES:
                ch = beyond[r.id][vp]
                if level_at([(a, b, c) for a, b, c in ch], y.mid)[0] > level_at([(a, b, c) for a, b, c in ch], y.mid - 0.01)[0]:
                    lifted.append(r.id)
                continue
            for c in r.cells:
                tl = own_tls[vp][c]
                if level_at(tl, y.mid)[0] > level_at(tl, y.mid - 0.01)[0]:
                    lifted.append(r.id)
                    break
        # A journey of ideas through lands already known (Confucius among the states), or one whose findings
        # stayed unpublished for generations (Xu Xiake's diaries), says so with "lifts": false.
        if not lifted and j.get("lifts") is not False:
            fail(f"journeys/{j['id']}.json: no 'informs' entry lifts any fog (set \"lifts\": false if none should)")
        j["_lifts"] = sorted(set(lifted))

    print("  cards, cities, search …")
    region_journeys: dict[str, set] = defaultdict(set)
    city_journeys: dict[str, set] = defaultdict(set)
    for j in journeys:
        for inf in j.get("informs", []):
            region_journeys[inf["region"]].add(j["id"])
        for s in j["stops"]:
            if s.get("waypoint") or "lat" not in s or s.get("body") in ("moon", "moon-orbit"):
                continue
            lat = max(-89.9, min(89.9, s["lat"]))
            c = grid.index[h3.latlng_to_cell(lat, s["lon"], RES)]
            for ri in member[c]:
                if not regions[ri].hidden:
                    region_journeys[regions[ri].id].add(j["id"])
            if s.get("city"):
                city_journeys[s["city"]].add(j["id"])
            for city in cities:
                if haversine_km(lat, s["lon"], city["lat"], city["lon"]) < 30:
                    city_journeys[city["id"]].add(j["id"])
    known_cities = {c["id"] for c in cities}
    for j in journeys:
        for s in j["stops"]:
            if s.get("city") and s["city"] not in known_cities:
                fail(f"journeys/{j['id']}.json: stop {s.get('place')!r} names unknown city {s['city']!r}")

    within_all = containment(regions)
    region_docs = []
    for r in regions:
        evs = {}
        for vp in ["*", *ALL_VPS]:
            lst = events[vp].get(r.id, [])
            if lst:
                evs[vp] = [
                    {k: v for k, v in {
                        "y": e.lo if e.lo == e.hi else [e.lo, e.hi], "level": e.level, "cap": e.cap or None,
                        "conf": e.conf, "source": e.source, "note": e.note or None, "journey": e.journey,
                    }.items() if v is not None}
                    for e in lst
                ]
        parents = []
        if r.geom is not None and r.label:
            pt = Point(*r.label)
            parents = [o.id for o in sorted(regions, key=lambda o: o.area)
                       if o is not r and o.geom is not None and not o.hidden and o.area > r.area and o.geom.contains(pt)][:2]
        doc = {
            "id": r.id, "name": r.name, "surface": r.surface,
            "label": [round(r.label[0], 2), round(r.label[1], 2)] if r.label else None,
            "cells": int(len(r.cells)), "parents": parents,
            "within": [regions[k].id for k in within_all.get(r.idx, [])],
            "names": names.get(("region", r.id), []),
            "events": evs, "journeys": sorted(region_journeys.get(r.id, [])),
        }
        if r.body:
            doc["body"] = r.body
        if r.hidden:
            doc["hidden"] = True
        region_docs.append(doc)

    pictured = load_depictions(sources, vp_ids, {
        "city": {c["id"] for c in cities},
        "journey": {j["id"]: [st for st in j["stops"] if not st.get("waypoint")] for j in journeys},
        "invention": {inv["id"] for inv in inventions},
    })
    for inv in inventions:
        if inv["id"] in pictured["invention"]:
            inv["pictures"] = pictured["invention"][inv["id"]]
    city_docs = []
    for c in cities:
        doc = {k: v for k, v in c.items() if k != "mid"}
        if c["id"] in pictured["city"]:
            doc["pictures"] = pictured["city"][c["id"]]
        doc["names"] = names.get(("city", c["id"]), [])
        doc["journeys"] = sorted(city_journeys.get(c["id"], []))
        doc["region"] = int(primary[c["cell"]]) if primary[c["cell"]] != 0xFFFF else None
        city_docs.append(doc)

    print("  routes …")
    router = Router(ne, BASEMAP_SRC)
    for j in journeys:
        j["_routes"], lengths, j["_modes"] = route_journey(router, j)
        j["_times"] = stop_times(j, lengths)
        check_route_sanity(router, j)
    router.save()
    met = crossings(journeys)
    journey_docs = []
    for j in journeys:
        doc = {k: v for k, v in j.items() if not k.startswith("_")}
        doc["lifts"] = j["_lifts"]
        doc["route"] = [[[round(x, 2), round(y, 2)] for x, y in r] if r else None for r in j["_routes"]]
        doc["t"] = j["_times"]
        doc["crossings"] = met[j["id"]]
        if j["id"] in pictured["journey"]:
            doc["pictures"] = pictured["journey"][j["id"]]
        for inf in doc["informs"]:
            if isinstance(inf["level"], str):
                inf["level"] = int(inf["level"].lstrip("="))
            y = parse_year(inf["homeKnows"], j["id"])
            inf["homeKnowsMid"] = y.mid
            inf.setdefault("viewpoint", j["viewpoint"])
        journey_docs.append(doc)

    search = []
    for r in region_docs:
        if r.get("hidden"):
            continue
        alts = sorted({n["name"] for n in r["names"]} | {n["native"] for n in r["names"] if n.get("native")} - {r["name"]})
        search.append({"t": "region", "id": r["id"], "label": r["name"], "alt": alts})
    for c in city_docs:
        defaults = [n["name"] for n in c["names"] if n["vp"] == "*"]
        label = defaults[-1] if defaults else c["id"]
        alts = sorted({n["name"] for n in c["names"]} | {n["native"] for n in c["names"] if n.get("native")} - {label})
        search.append({"t": "city", "id": c["id"], "label": label, "alt": alts})
    for j in journey_docs:
        search.append({"t": "journey", "id": j["id"], "label": j["name"], "alt": [j.get("traveler", ""), j.get("years", "")]})
    for inv in inventions:
        search.append({"t": "invention", "id": inv["id"], "label": inv["name"], "alt": [a for a in (inv.get("native"), inv["place"]) if a]})

    flags = (grid.land.astype(np.uint8) | (grid.coastal.astype(np.uint8) << 1))
    grid_doc = {
        "res": RES, "count": len(grid.cells), "first": grid.cells[0], "last": grid.cells[-1],
        "flags": b64(flags), "region": b64(primary),
    }
    sizes["grid.json"] = write_json("grid.json", grid_doc)
    sizes["regions.json"] = write_json("regions.json", region_docs)
    sizes["cities.json"] = write_json("cities.json", city_docs)
    sizes["journeys.json"] = write_json("journeys.json", journey_docs)
    # Series: a traveller's several journeys, shown as one row in the list.
    series = json.loads((DATA / "series.json").read_text(encoding="utf-8")) if (DATA / "series.json").exists() else []
    jids, in_series = {j["id"] for j in journey_docs}, set()
    for sr in series:
        for jid in sr.get("journeys", []):
            if jid not in jids:
                fail(f"series.json: {sr.get('id')!r} names unknown journey {jid!r}")
            if jid in in_series:
                fail(f"series.json: journey {jid!r} is in two series")
            in_series.add(jid)
    sizes["series.json"] = write_json("series.json", series)
    sizes["inventions.json"] = write_json("inventions.json", inventions)
    sizes["beyond.json"] = write_json("beyond.json", beyond)
    sizes["sources.json"] = write_json("sources.json", sources)
    sizes["viewpoints.json"] = write_json("viewpoints.json", viewpoints)
    sizes["search.json"] = write_json("search.json", search)
    zh = load_translations(journeys, regions_by_id, inventions, vp_ids, viewpoints, {c["id"] for c in cities}, events)
    if zh:
        sizes["i18n/zh.json"] = write_json("i18n/zh.json", zh)

    if errors:
        print(f"\n✗ {len(errors)} problem(s):", file=sys.stderr)
        for e in errors:
            print("  · " + e, file=sys.stderr)
        return 1

    digest = hashlib.sha1()
    for name in sorted(sizes):
        digest.update((OUT / name).read_bytes())
    write_json("manifest.json", {
        "version": digest.hexdigest()[:12],
        "counts": {"cells": len(grid.cells), "regions": len(region_docs), "cities": len(city_docs),
                   "journeys": len(journey_docs), "inventions": len(inventions), "events": sum(len(v) for d in events.values() for v in d.values())},
    })
    fog_bytes = sum(v for k, v in sizes.items() if k.startswith("fog/") or k == "grid.json")
    for w in warnings:
        print("  ! " + w)
    print(f"✓ {len(region_docs)} regions · {len(city_docs)} cities · {len(journey_docs)} journeys · {len(inventions)} inventions · "
          f"fog data {fog_bytes / 1e6:.2f} MB · total {sum(sizes.values()) / 1e6:.2f} MB")
    if fog_bytes > 5e6:
        print("✗ fog data is over the 5 MB budget", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
