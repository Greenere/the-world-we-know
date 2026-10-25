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
MAIN_VPS = ["europe", "china", "islam", "polynesia"]
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
    primary = np.full(n, 0xFFFF, dtype=np.uint16)
    for c in range(n):
        vis = [i for i in member[c] if not regions[i].hidden]
        if vis:
            primary[c] = min(vis, key=lambda i: regions[i].area)
    uncovered = int((primary == 0xFFFF).sum())
    if uncovered:
        warn(f"{uncovered} cells lie outside every named region (open ocean or remote islands)")
    return member, primary


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
            level = inf.get("level")
            if not isinstance(level, int) or not 0 <= level <= 5:
                fail(f"{where}: level must be an integer 0–5")
                continue
            src = inf.get("source", j.get("source"))
            conf = check_ref(where, src, inf.get("confidence"), sources)
            seq += 1
            events[vp][rid].append(Event(y.mid, seq, level, False, conf, y.lo, y.hi, src, inf.get("note", ""), j["id"]))
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


def cell_timelines(vp: str, member, regions, events, grid: Grid):
    """Per cell, a list of change points [(year, level, conf)] for one viewpoint."""
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
            changes, prev, any_cap = [], (0, 0), False
            for y in years:
                lvl, conf, capped = evaluate(tls, y)
                any_cap |= capped
                if (lvl, conf) != prev:
                    changes.append((y, lvl, conf))
                    prev = (lvl, conf)
            cache[sig] = (changes, any_cap)
        changes, any_cap = cache[sig]
        out.append(changes)
        has_cap[c] = any_cap
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
        if not j.get("informs"):
            fail(f"{where}: must inform at least one viewpoint about at least one region")
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
    cities = []
    seen = set()
    for row in read_csv(DATA / "cities.csv"):
        where = f"cities.csv:{row['_line']}"
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
        if "founded" not in dates:
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
        if row.get("story"):
            city["story"] = row["story"]
        cities.append(city)
    return cities


DEPICTION_FORMATS = (".webp", ".png", ".jpg", ".jpeg")
# The sizes the site serves: the strip of eras, the card, and the enlarged view.
DEPICTION_SIZES = {"thumb": 200, "card": 720, "full": 1280}
# What each kind of subject holds: a city has eras in time, from one fixed view; a journey has scenes,
# each pinned to one of its stops. Later: regions, inventions.
DEPICTION_KINDS = {"city": "eras", "journey": "scenes"}


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
    """Imagined sketches: a city through its eras, or scenes along a journey.

    data/depictions/style.json                     the drawing style for each kind
    data/depictions/<kind>/<id>/subject.json       city: the fixed `view` and `eras` (from/to years)
                                                   journey: the `traveller` and `scenes` (each at a stop)
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
            needed = ("id", "title", "caption", "sources", "confidence", "prompt") + (("from",) if kind == "city" else ("stop", "place"))
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
        else:
            items.sort(key=lambda r: r["stop"])
            for a, b in zip(items, items[1:]):
                if a["stop"] == b["stop"]:
                    fail(f"{where}: scenes {a['id']} and {b['id']} are at the same stop")
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
    for v in viewpoints:
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
    inventions = load_inventions(sources, vp_ids)
    names = load_names(regions_by_id, {c["id"] for c in cities}, vp_ids, sources)
    for c in cities:
        if not any(n["vp"] == "*" for n in names.get(("city", c["id"]), [])):
            fail(f"names.csv: city {c['id']} has no default (*) name")

    print("  fog …")
    fog_tls = {}
    for vp in ALL_VPS:
        tls = cell_timelines(vp, member, regions, events, grid)
        fog_tls[vp] = tls
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
                tl = fog_tls[vp][c]
                if level_at(tl, y.mid)[0] > level_at(tl, y.mid - 0.01)[0]:
                    lifted.append(r.id)
                    break
        if not lifted:
            fail(f"journeys/{j['id']}.json: no 'informs' entry lifts any fog")
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
    })
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
    sizes["inventions.json"] = write_json("inventions.json", inventions)
    sizes["beyond.json"] = write_json("beyond.json", beyond)
    sizes["sources.json"] = write_json("sources.json", sources)
    sizes["viewpoints.json"] = write_json("viewpoints.json", viewpoints)
    sizes["search.json"] = write_json("search.json", search)

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
