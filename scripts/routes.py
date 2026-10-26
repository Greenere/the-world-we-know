"""Realistic paths between journey stops, and one clock for every journey.

Legs are routed on an H3 grid (resolution 4, ~22 km cells) with a cost per cell:

    sea     open water is cheap, land nearly impassable (so a ship goes round
            Africa rather than over Suez before 1869), and the cell next to the
            shore costs a little more, so ships keep an offing
    land    cost rises with slope and altitude; river valleys are cheaper; a short
            sea crossing (the Hellespont, Gibraltar) is allowed at a price
    river   like land, but rivers are much cheaper: canoes and keelboats
    direct  a great circle (spaceflight, the last climb on Everest, sledges)

Authors' waypoints always win: the router only fills the gap between two
consecutive points. The cell path is then pulled taut (a shortcut is taken only
through terrain no worse than the path it replaces, so ships don't cut headlands
and caravans keep to their passes), and a centripetal Catmull-Rom spline is drawn
through what is left. The curve runs on through waypoints, and through stops
where the traveller carries on roughly the same way. Narrow straits that a 22 km grid would close are carved
open by hand, and canals open in the year they did.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
import urllib.request
from pathlib import Path

import h3
import numpy as np
import shapely
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import dijkstra
from shapely.geometry import LineString, shape
from shapely.ops import unary_union

RES = 4
ETOPO_URL = "https://www.ngdc.noaa.gov/mgg/global/relief/ETOPO5/TOPO/ETOPO5/ETOPO5.DAT"
# Bump VERSION when the routing changes (it keys the route cache); GRID_VERSION only when the grid does.
VERSION = "routes-8"
GRID_VERSION = "routes-3"

ARCTIC_ICE_LAT = 69.0  # sea north of this is pack ice for routing (the Bering Strait, at 66°, stays open)
SEA_KINDS = {"sailor", "fleet", "merchant route", "group voyage", "deep dive"}
DIRECT_KINDS = {"spaceflight", "mountaineering"}
MODES = ("sea", "land", "river", "direct")

# (name, [(lon, lat), …], year it opened or None). Carved through as water.
PASSAGES = [
    ("Strait of Gibraltar", [(-6.3, 35.93), (-5.6, 35.96), (-5.0, 36.05)], None),
    ("Bosporus", [(28.98, 41.0), (29.05, 41.12), (29.12, 41.23)], None),
    ("Dardanelles", [(26.15, 40.03), (26.4, 40.2), (26.7, 40.42)], None),
    ("Strait of Messina", [(15.62, 38.05), (15.65, 38.22), (15.72, 38.32)], None),
    ("Øresund", [(12.65, 55.55), (12.7, 56.0), (12.55, 56.15)], None),
    ("Kerch Strait", [(36.55, 45.05), (36.6, 45.4)], None),
    ("Bab-el-Mandeb", [(43.15, 12.35), (43.45, 12.7)], None),
    ("Strait of Hormuz", [(56.1, 26.3), (56.6, 26.6)], None),
    ("Strait of Dover", [(1.3, 50.95), (1.65, 51.1)], None),
    ("Strait of Bonifacio", [(9.0, 41.35), (9.4, 41.35)], None),
    ("Strait of Magellan", [(-68.3, -52.4), (-69.5, -52.5), (-70.4, -52.9), (-70.9, -53.6),
                            (-71.4, -53.9), (-72.5, -53.4), (-73.5, -52.95), (-74.4, -52.7)], None),
    ("Sunda Strait", [(105.75, -5.75), (105.9, -6.15)], None),
    ("Singapore Strait", [(103.3, 1.15), (103.85, 1.2), (104.4, 1.3)], None),
    ("Cook Strait", [(174.45, -41.15), (174.65, -41.45)], None),
    ("Strait of Canso", [(-61.4, 45.55), (-61.45, 45.7)], None),
    ("Suez Canal", [(32.3, 31.3), (32.33, 30.6), (32.55, 29.9)], 1869),
    ("Panama Canal", [(-79.92, 9.4), (-79.7, 9.1), (-79.52, 8.85)], 1914),
]


def great_circle(a, b, step_km=60.0):
    """Points along the great circle from a to b (lon, lat), longitudes unwrapped from a."""
    (lon1, lat1), (lon2, lat2) = a, b
    p1, l1, p2, l2 = map(math.radians, (lat1, lon1, lat2, lon2))
    d = 2 * math.asin(min(1, math.sqrt(math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin((l2 - l1) / 2) ** 2)))
    n = max(1, int(d * 6371 / step_km))
    out = []
    for k in range(n + 1):
        f = k / n
        if d < 1e-9:
            lat, lon = lat1, lon1
        else:
            A = math.sin((1 - f) * d) / math.sin(d)
            B = math.sin(f * d) / math.sin(d)
            x = A * math.cos(p1) * math.cos(l1) + B * math.cos(p2) * math.cos(l2)
            y = A * math.cos(p1) * math.sin(l1) + B * math.cos(p2) * math.sin(l2)
            z = A * math.sin(p1) + B * math.sin(p2)
            lat, lon = math.degrees(math.atan2(z, math.hypot(x, y))), math.degrees(math.atan2(y, x))
        out.append((lon, lat))
    return unwrap(out)


def unwrap(coords):
    out = []
    for lon, lat in coords:
        if out:
            ref = out[-1][0]
            while lon - ref > 180:
                lon -= 360
            while ref - lon > 180:
                lon += 360
        out.append((lon, lat))
    return out


def km(a, b):
    p1, p2 = math.radians(a[1]), math.radians(b[1])
    dp, dl = p2 - p1, math.radians(b[0] - a[0])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371 * 2 * math.asin(min(1, math.sqrt(h)))


def path_km(coords):
    return sum(km(coords[i - 1], coords[i]) for i in range(1, len(coords)))


def _metric(a, b):
    """Planar distance in degrees with longitude shrunk by latitude: what the eye sees on the map."""
    k = math.cos(math.radians((a[1] + b[1]) / 2))
    return math.hypot((b[0] - a[0]) * k, b[1] - a[1])


def _turn(a, b, c) -> float:
    """Degrees the path turns at b."""
    k = math.cos(math.radians(b[1]))
    u = ((b[0] - a[0]) * k, b[1] - a[1])
    v = ((c[0] - b[0]) * k, c[1] - b[1])
    nu, nv = math.hypot(*u), math.hypot(*v)
    if nu < 1e-9 or nv < 1e-9:
        return 0.0
    cos = max(-1.0, min(1.0, (u[0] * v[0] + u[1] * v[1]) / (nu * nv)))
    return math.degrees(math.acos(cos))


def catmull_rom(points, before=None, after=None, alpha=0.5, blocked=None):
    """A centripetal Catmull-Rom curve through every point: smooth, with no loops or overshoot.

    `before` / `after` are the neighbours beyond the ends (from the adjoining legs) so the curve runs on
    smoothly through a stop; without them the ends head straight for the next point. `blocked(x, y)`
    says where the curve may not go (land, for a ship); a span that strays there is drawn straight.
    """
    pts = [tuple(p) for p in points]
    if len(pts) < 2:
        return pts
    first = before if before is not None else (2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1])
    last = after if after is not None else (2 * pts[-1][0] - pts[-2][0], 2 * pts[-1][1] - pts[-2][1])
    P = [first, *pts, last]
    out = [pts[0]]
    for k in range(len(pts) - 1):
        p0, p1, p2, p3 = P[k], P[k + 1], P[k + 2], P[k + 3]
        t0 = 0.0
        t1 = t0 + max(1e-6, _metric(p0, p1)) ** alpha
        t2 = t1 + max(1e-6, _metric(p1, p2)) ** alpha
        t3 = t2 + max(1e-6, _metric(p2, p3)) ** alpha
        span_km = km(p1, p2)
        bend = _turn(p0, p1, p2) + _turn(p1, p2, p3)
        m = max(1, min(24, math.ceil(span_km / 90) + math.ceil(bend / 10)))
        span = []
        for i in range(1, m + 1):
            t = t1 + (t2 - t1) * i / m
            # Barry and Goldman's pyramid.
            def lerp(a, b, ta, tb):
                w = (t - ta) / (tb - ta)
                return (a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w)
            a1, a2, a3 = lerp(p0, p1, t0, t1), lerp(p1, p2, t1, t2), lerp(p2, p3, t2, t3)
            b1, b2 = lerp(a1, a2, t0, t2), lerp(a2, a3, t1, t3)
            span.append(lerp(b1, b2, t1, t2))
        span[-1] = p2
        if blocked and any(blocked(x, y) for x, y in span[:-1]):
            span = [(p1[0] + (p2[0] - p1[0]) * i / m, p1[1] + (p2[1] - p1[1]) * i / m) for i in range(1, m + 1)]
        out.extend(span)
    return out


class Router:
    def __init__(self, ne: dict, cache_dir: Path):
        self.cache_path = cache_dir / "route-cache.json"
        try:
            self.cache = json.loads(self.cache_path.read_text()) if self.cache_path.exists() else {}
        except ValueError:
            self.cache = {}
        self.dirty = False
        self._graphs: dict[tuple, csr_matrix] = {}
        self._costs: dict[tuple, np.ndarray] = {}
        grid_path = cache_dir / f"route-grid-{GRID_VERSION}.npz"
        if grid_path.exists():
            z = np.load(grid_path, allow_pickle=False)
            self.cells = [str(c) for c in z["cells"]]
            for k in ("lat", "lon", "land", "water_forced", "canal_year", "elev", "river", "shore", "src", "dst", "dist"):
                setattr(self, k, z[k])
        else:
            self._build(ne, cache_dir)
            np.savez_compressed(
                grid_path, cells=np.array(self.cells), lat=self.lat, lon=self.lon, land=self.land,
                water_forced=self.water_forced, canal_year=self.canal_year, elev=self.elev, river=self.river,
                shore=self.shore, src=self.src, dst=self.dst, dist=self.dist,
            )
        self.index = {c: i for i, c in enumerate(self.cells)}
        self.n = len(self.cells)

    # ── Grid ───────────────────────────────────────────────────────────────

    def _build(self, ne: dict, cache_dir: Path):
        print("    routing grid (once) …")
        cells = sorted(c for r0 in h3.get_res0_cells() for c in h3.cell_to_children(r0, RES))
        index = {c: i for i, c in enumerate(cells)}
        n = len(cells)
        lat = np.empty(n)
        lon = np.empty(n)
        for i, c in enumerate(cells):
            lat[i], lon[i] = h3.cell_to_latlng(c)

        land_geom = unary_union(
            [shape(f["geometry"]) for f in ne["ne_50m_land"]["features"]]
            + [shape(f["geometry"]) for f in ne["ne_50m_antarctic_ice_shelves_polys"]["features"]]
        )
        lakes = unary_union([shape(f["geometry"]) for f in ne["ne_50m_lakes"]["features"]])
        land_geom = land_geom.difference(lakes)
        shapely.prepare(land_geom)
        land = shapely.contains_xy(land_geom, lon, lat)

        # Straits and canals: every cell along them is water (canals only from their opening year).
        water_forced = np.zeros(n, dtype=bool)
        canal_year = np.zeros(n, dtype=np.int32)
        for _name, pts, opened in PASSAGES:
            line = great_circle_chain(pts)
            for x, y in line:
                i = index[h3.latlng_to_cell(y, x, RES)]
                if opened:
                    canal_year[i] = opened
                else:
                    water_forced[i] = True

        # Elevation: ETOPO5 (5 arc-minutes), averaged at the centre and six points around it.
        elev_grid = load_etopo(cache_dir)
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
        elev = np.zeros(n)
        for x, y in zip(xs, ys):
            r = np.clip(((90 - y) * 12).astype(int), 0, 2159)
            c = ((x % 360) * 12).astype(int) % 4320
            elev += elev_grid[r, c]
        elev = np.maximum(0, elev / len(xs))

        # Rivers: every cell a Natural Earth river (or lake centreline) passes through.
        river = np.zeros(n, dtype=bool)
        for f in ne["ne_50m_rivers_lake_centerlines"]["features"]:
            g = shape(f["geometry"])
            for part in getattr(g, "geoms", [g]):
                coords = list(part.coords)
                for a, b in zip(coords, coords[1:]):
                    steps = max(1, int(km(a, b) / 6))
                    for k in range(steps + 1):
                        x = a[0] + (b[0] - a[0]) * k / steps
                        y = a[1] + (b[1] - a[1]) * k / steps
                        river[index[h3.latlng_to_cell(y, x, RES)]] = True

        src, dst, dist = [], [], []
        for i, c in enumerate(cells):
            for nb in h3.grid_disk(c, 1):
                if nb == c:
                    continue
                j = index[nb]
                src.append(i)
                dst.append(j)
                dist.append(km((lon[i], lat[i]), (lon[j], lat[j])))
        src = np.array(src, dtype=np.int32)
        dst = np.array(dst, dtype=np.int32)
        dist = np.array(dist, dtype=np.float32)

        # Sea cells touching land: a ship keeps a little way off the shore.
        is_land = land & ~water_forced
        shore = np.zeros(n, dtype=bool)
        np.logical_or.at(shore, src, is_land[dst])
        shore &= ~is_land

        self.cells, self.lat, self.lon = cells, lat, lon
        self.land, self.water_forced, self.canal_year = land, water_forced, canal_year
        self.elev, self.river, self.shore = elev.astype(np.float32), river, shore
        self.src, self.dst, self.dist = src, dst, dist

    def is_land(self, year: float) -> np.ndarray:
        open_canal = (self.canal_year > 0) & (self.canal_year <= year)
        return self.land & ~self.water_forced & ~open_canal

    def graph(self, mode: str, year: float) -> csr_matrix:
        epoch = 0 if year < 1869 else 1 if year < 1914 else 2
        key = (mode, epoch)
        if key in self._graphs:
            return self._graphs[key]
        land = self.is_land({0: 1800, 1: 1900, 2: 2000}[epoch])
        if mode == "sea":
            # The Arctic pack: no ship got through the Northwest or Northeast passage before 1878–1906, and
            # none of these voyages tried, so the high Arctic is as closed as land.
            ice = self.lat > ARCTIC_ICE_LAT
            cost = np.where(land | ice, 2000.0, np.where(self.shore, 1.3, 1.0))
        else:
            altitude = 1 + np.maximum(0, self.elev - 1800) / 1000 * 0.6
            base = np.where(self.river, 0.22 if mode == "river" else 0.75, 1.0) * altitude
            cost = np.where(land, base, 30.0)
        w = self.dist * (cost[self.src] + cost[self.dst]) / 2
        if mode != "sea":
            grade = np.abs(self.elev[self.src] - self.elev[self.dst]) / (self.dist * 1000)
            w = w * (1 + 18 * grade)
        g = csr_matrix((w.astype(np.float64), (self.src, self.dst)), shape=(self.n, self.n))
        self._graphs[key] = g
        self._costs[key] = cost
        return g

    def cell(self, lon: float, lat: float) -> int:
        return self.index[h3.latlng_to_cell(lat, ((lon + 180) % 360) - 180, RES)]

    def water_fraction(self, a, b, year: float) -> float:
        pts = great_circle(a, b, step_km=25)
        land = self.is_land(year)
        return sum(not land[self.cell(x, y)] for x, y in pts) / len(pts)

    # ── Routing ────────────────────────────────────────────────────────────

    def route(self, a, b, mode: str, year: float):
        """The taut path from a to b as (lon, lat) corner points, longitudes unwrapped from a's."""
        if mode == "direct" or km(a, b) < 30:
            return great_circle(a, b, step_km=80)
        epoch = 0 if year < 1869 else 1 if year < 1914 else 2
        key = f"{VERSION}|{mode}|{epoch}|{a[0]:.3f},{a[1]:.3f}|{b[0]:.3f},{b[1]:.3f}"
        if key in self.cache:
            return [tuple(p) for p in self.cache[key]]
        g = self.graph(mode, year)
        s, t = self.cell(*a), self.cell(*b)
        if mode == "sea":
            # An inland stop (Mexico City) joins the sea on the coast that faces where the leg is going.
            s, t = self.nearest_water(s, year, toward=b), self.nearest_water(t, year, toward=a)
        straight = km(a, b)
        limit = straight * (6 if mode == "sea" else 4) + 1500
        path = None
        for lim in (limit, np.inf):
            _, pred = dijkstra(g, directed=True, indices=s, return_predecessors=True, limit=lim)
            if pred[t] >= 0 or s == t:
                path = [t]
                while path[-1] != s:
                    path.append(int(pred[path[-1]]))
                path.reverse()
                break
        if path is None:
            coords = great_circle(a, b)
        else:
            cells = self.taut(path, mode, year)
            mid = [(float(self.lon[i]), float(self.lat[i])) for i in cells[1:-1]]
            coords = unwrap([a, *mid, b])
        out = [(round(x, 3), round(y, 3)) for x, y in coords]
        self.cache[key] = out
        self.dirty = True
        return out

    def taut(self, path: list[int], mode: str, year: float) -> list[int]:
        """Pull a cell path tight: from each corner, jump to the furthest cell still in sight, where in sight
        means the straight line crosses nothing costlier (or, on land, higher) than the stretch it replaces."""
        self.graph(mode, year)
        epoch = 0 if year < 1869 else 1 if year < 1914 else 2
        cost = self._costs[(mode, epoch)]
        lon = unwrap([(float(self.lon[i]), float(self.lat[i])) for i in path])
        c = cost[path]
        e = self.elev[path]

        open_water = cost.min()

        def clear(i: int, j: int) -> bool:
            # Judge by the cells between, not the ends: a coastal stop's own cell may count as sea, and must
            # not license a land route to cut straight across the water.
            inner = c[i + 1:j] if j > i + 1 else np.minimum(c[i:i + 1], c[j:j + 1])
            cmax = inner.max() * 1.001
            emax = e[i:j + 1].max() + 150
            (x0, y0), (x1, y1) = lon[i], lon[j]
            d = km(lon[i], lon[j])
            n = max(2, int(d / 10))
            for k in range(1, n):
                q = self.cell(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n)
                # At sea a shortcut keeps an offing: away from its ends it may only cross open water.
                limit = open_water * 1.001 if mode == "sea" and 25 < d * k / n < d - 25 else cmax
                if cost[q] > limit or (mode != "sea" and self.elev[q] > emax):
                    return False
            return True

        keep = [0]
        i = 0
        last = len(path) - 1
        while i < last:
            # Gallop out until the view is blocked, then binary-search the furthest visible cell.
            step, good = 1, i + 1
            while good + step <= last and clear(i, good + step):
                good += step
                step *= 2
            lo, hi = good, min(last, good + step)
            while hi - lo > 1:
                mid = (lo + hi) // 2
                if clear(i, mid):
                    lo = mid
                else:
                    hi = mid
            if hi <= last and hi > lo and clear(i, hi):
                lo = hi
            keep.append(lo)
            i = lo
        return [path[k] for k in keep]

    def nearest_water(self, i: int, year: float, toward=None) -> int:
        """The sea cell nearest an inland point; among the nearby coasts, the one facing `toward`."""
        land = self.is_land(year)
        if not land[i]:
            return i
        c = self.cells[i]
        found, first = [], None
        for k in range(1, 30):
            ring = [self.index[x] for x in h3.grid_ring(c, k)]
            water = [j for j in ring if not land[j] and self.lat[j] <= ARCTIC_ICE_LAT]
            if water and first is None:
                first = k
            found += water
            # Only coasts a little further than the nearest one (about 150 km) are considered.
            if first is not None and (toward is None or k >= first + 4):
                break
        if not found:
            return i
        if toward is None:
            return found[0]
        return min(found, key=lambda j: km((float(self.lon[j]), float(self.lat[j])), toward))

    def save(self):
        if self.dirty:
            self.cache_path.write_text(json.dumps(self.cache, separators=(",", ":")))


def great_circle_chain(pts):
    out = []
    for a, b in zip(pts, pts[1:]):
        out.extend(great_circle(a, b, step_km=4))
    return out


def load_etopo(cache_dir: Path) -> np.ndarray:
    path = cache_dir / "ETOPO5.DAT"
    if not path.exists():
        print("  downloading ETOPO5 elevation (NOAA, public domain) …")
        urllib.request.urlretrieve(ETOPO_URL, path)
    return np.fromfile(path, dtype=">i2").reshape(2160, 4320).astype(np.float32)


# ── Journeys: legs and clock ───────────────────────────────────────────────

MONTHS = {m: i for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"])}


def parse_date(text: str | None, year: int) -> float | None:
    """'27 December 1831' or 'May 1854' → a fractional year (mid-month when no day is given)."""
    if not text:
        return None
    m = re.fullmatch(r"(?:(\d{1,2}) )?([A-Za-z]+) (-?\d+)", text.strip())
    if not m or m.group(2).lower() not in MONTHS:
        return None
    day = int(m.group(1)) if m.group(1) else 15
    return int(m.group(3)) + (MONTHS[m.group(2).lower()] + (day - 1) / 30.5) / 12


def leg_mode(router: Router, j: dict, stop: dict, a, b, year: float) -> str:
    """How a leg was travelled: the stop's `by`, else the journey's, else a guess from its kind and the terrain."""
    kind = j.get("kind", "")
    if stop.get("by"):
        return stop["by"]
    if j.get("by"):
        return j["by"]
    if kind in DIRECT_KINDS:
        return "direct"
    if kind in SEA_KINDS:
        return "sea"
    wf = router.water_fraction(a, b, year)
    if kind == "polar":
        return "sea" if wf > 0.5 else "direct"
    return "sea" if wf > 0.5 else "land"


def route_journey(router: Router, j: dict):
    """For each stop (waypoints folded in): the curve from where its leg starts, its length, and its travel mode."""
    stops = j["stops"]
    on_map = lambda s: "lat" in s and "lon" in s and s.get("body") not in ("moon", "moon-orbit")
    real = [s for s in stops if not s.get("waypoint")]
    by_place = {}
    legs: list[dict | None] = []
    pending = []
    branch_from = None
    prev_index = -1
    # First pass: each leg's taut corner points, waypoints included.
    for s in stops:
        if s.get("from") and s["from"] in by_place:
            branch_from = by_place[s["from"]]
            pending = []
        if s.get("waypoint"):
            pending.append(s)
            continue
        idx = len(legs)
        start_i = branch_from if branch_from is not None else prev_index
        start = real[start_i] if start_i >= 0 else None
        if start is None or not on_map(start) or not on_map(s):
            legs.append(None)
        else:
            pts = [(start["lon"], start["lat"])] + [(w["lon"], w["lat"]) for w in pending] + [(s["lon"], s["lat"])]
            year = s.get("year", start.get("year", 0))
            corners = []
            leg_modes = set()
            for k in range(len(pts) - 1):
                # A waypoint belongs to the leg it shapes; its mode follows the stop it leads to.
                mode = leg_mode(router, j, s, pts[k], pts[k + 1], year)
                leg_modes.add(mode)
                seg = router.route(pts[k], pts[k + 1], mode, year)
                if corners:
                    # Continue from the previous segment's unwrapped end.
                    shift = round((corners[-1][0] - seg[0][0]) / 360) * 360
                    corners.extend((x + shift, y) for x, y in seg[1:])
                else:
                    corners.extend(seg)
            legs.append({
                "corners": corners, "from": start_i, "year": year,
                "mode": leg_modes.pop() if len(leg_modes) == 1 else "mixed",
            })
        if s.get("place"):
            by_place[s["place"]] = idx
        prev_index = idx
        pending = []
        branch_from = None

    # Second pass: a curve through each leg. Where the traveller passes through a stop and carries on
    # (turning less than 100°), the neighbouring leg's corner joins the curve so it flows on smoothly.
    def near(p, ref):
        return (p[0] + round((ref[0] - p[0]) / 360) * 360, p[1])

    def onward(i: int):
        """The leg that leaves stop i, if it continues from there."""
        nxt = legs[i + 1] if i + 1 < len(legs) else None
        return nxt if nxt and nxt["from"] == i else None

    routes, lengths, modes = [], [], []
    j["_origins"] = [leg["from"] if leg else max(0, i - 1) for i, leg in enumerate(legs)]
    for i, leg in enumerate(legs):
        if leg is None:
            routes.append(None)
            lengths.append(0.0)
            modes.append(None)
            continue
        c = leg["corners"]
        before = after = None
        prev = legs[leg["from"]] if leg["from"] >= 0 and leg["from"] == i - 1 else None
        if prev and len(prev["corners"]) > 1 and len(c) > 1:
            b = near(prev["corners"][-2], c[0])
            if _turn(b, c[0], c[1]) < 100:
                before = b
        nxt = onward(i)
        if nxt and len(nxt["corners"]) > 1 and len(c) > 1:
            a = near(nxt["corners"][1], c[-1])
            if _turn(c[-2], c[-1], a) < 100:
                after = a
        blocked = None
        if leg["mode"] == "sea":
            land = router.is_land(leg["year"])
            blocked = lambda x, y: bool(land[router.cell(x, y)])
        curve = catmull_rom(c, before, after, blocked=blocked)
        routes.append([(round(x, 3), round(y, 3)) for x, y in curve])
        lengths.append(path_km(curve))
        modes.append(leg["mode"])
    return routes, lengths, modes


def stop_times(j: dict, lengths: list[float]) -> list[float]:
    """A fractional year for every stop. Real dates are kept; the other stops of a year are spread
    across that year by distance travelled, so a stop never leaves its own year."""
    real = [s for s in j["stops"] if not s.get("waypoint")]
    n = len(real)
    years = []
    for s in real:
        years.append(s.get("year", years[-1] if years else 0))
    dated = {i: parse_date(s.get("date"), years[i]) for i, s in enumerate(real)}
    # Count every leg as at least 50 km, so stops in one place still take some time.
    leg = [0.0] + [max(50.0, lengths[i]) for i in range(1, n)]
    cum = [0.0]
    for i in range(1, n):
        cum.append(cum[-1] + leg[i])
    t = [0.0] * n
    a = 0
    while a < n:
        b = a
        while b + 1 < n and years[b + 1] == years[a]:
            b += 1
        y = years[a]
        # The year begins halfway along the leg that arrives and ends halfway along the one that leaves.
        lead_in = leg[a] if a > 0 else 400.0
        lead_out = leg[b + 1] if b + 1 < n else 400.0
        anchors = [(cum[a] - 0.5 * lead_in, float(y))]
        anchors += [(cum[i], dated[i]) for i in range(a, b + 1) if dated[i] is not None]
        anchors.append((cum[b] + 0.5 * lead_out, y + 0.99))
        for i in range(a, b + 1):
            if dated[i] is not None:
                t[i] = dated[i]
                continue
            for (p0, t0), (p1, t1) in zip(anchors, anchors[1:]):
                if p0 <= cum[i] <= p1:
                    t[i] = t0 + (t1 - t0) * ((cum[i] - p0) / (p1 - p0) if p1 > p0 else 0.5)
                    break
        a = b + 1
    for i in range(1, n):
        t[i] = max(t[i], t[i - 1])
    return [round(x, 4) for x in t]


def position_at(routes, times, year, origins=None):
    """Where a journey's lead party is at a (fractional) year, or None outside it or off the map. Each leg runs
    from its origin stop's time to its own; where parties travel at once, the latest-departing one is used."""
    if year < times[0] or year > times[-1]:
        return None
    origins = origins or [max(0, i - 1) for i in range(len(times))]
    best = None
    for i in range(1, len(times)):
        t0, t1 = times[origins[i]], times[i]
        if not (t0 <= year <= t1) or not routes[i]:
            continue
        if best is None or t0 >= best[0]:
            best = (t0, i)
    if best is None:
        return None
    i = best[1]
    t0, t1, r = times[origins[i]], times[i], routes[i]
    f = (year - t0) / (t1 - t0) if t1 > t0 else 1
    target = path_km(r) * f
    acc = 0.0
    for a, b in zip(r, r[1:]):
        d = km(a, b)
        if acc + d >= target:
            g = (target - acc) / d if d else 0
            return (a[0] + (b[0] - a[0]) * g, a[1] + (b[1] - a[1]) * g)
        acc += d
    return r[-1]


def crossings(journeys: list[dict]) -> dict[str, list[dict]]:
    """Moments two journeys came close: under way at once within 1,500 km, or at the same place
    (within 150 km) within five years of each other."""
    out: dict[str, list[dict]] = {j["id"]: [] for j in journeys}
    real = {j["id"]: [s for s in j["stops"] if not s.get("waypoint")] for j in journeys}
    for ai, A in enumerate(journeys):
        for B in journeys[ai + 1:]:
            ta, tb = A["_times"], B["_times"]
            lo, hi = max(ta[0], tb[0]), min(ta[-1], tb[-1])
            best = None
            if lo < hi:
                steps = int(min(400, max(40, (hi - lo) * 60)))
                for k in range(steps + 1):
                    y = lo + (hi - lo) * k / steps
                    pa, pb = position_at(A["_routes"], ta, y, A.get("_origins")), position_at(B["_routes"], tb, y, B.get("_origins"))
                    if pa and pb:
                        d = km(pa, pb)
                        if d < 1500 and (best is None or d < best[0]):
                            best = (d, y, pa, pb)
            if best:
                d, y, pa, pb = best
                rec = {"kind": "meanwhile", "t": round(y, 3), "km": round(d)}
                out[A["id"]].append({**rec, "journey": B["id"], "place": nearest_place(real[A["id"]], pa), "otherPlace": nearest_place(real[B["id"]], pb), "otherT": round(y, 3)})
                out[B["id"]].append({**rec, "journey": A["id"], "place": nearest_place(real[B["id"]], pb), "otherPlace": nearest_place(real[A["id"]], pa), "otherT": round(y, 3)})
                continue
            near = None
            for i, s in enumerate(real[A["id"]]):
                for k, u in enumerate(real[B["id"]]):
                    if "lat" not in s or "lat" not in u or s.get("body") or u.get("body"):
                        continue
                    dt = abs(ta[i] - tb[k])
                    d = km((s["lon"], s["lat"]), (u["lon"], u["lat"]))
                    if d < 150 and dt <= 5 and (near is None or dt < near[0]):
                        near = (dt, d, i, k)
            if near:
                dt, d, i, k = near
                for X, Y, xi, yi in ((A, B, i, k), (B, A, k, i)):
                    out[X["id"]].append({
                        "kind": "same place", "t": X["_times"][xi], "km": round(d), "journey": Y["id"],
                        "place": real[X["id"]][xi].get("place", ""), "otherPlace": real[Y["id"]][yi].get("place", ""),
                        "otherT": Y["_times"][yi],
                    })
    for v in out.values():
        v.sort(key=lambda c: c["t"])
    return out


def nearest_place(stops, p):
    best = min((s for s in stops if "lat" in s and not s.get("body")), key=lambda s: km((s["lon"], s["lat"]), p), default=None)
    return best.get("place", "") if best else ""
