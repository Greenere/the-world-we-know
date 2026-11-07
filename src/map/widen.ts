import {cellToLatLng} from 'h3-js';
import type {Map as MlMap, PaddingOptions} from 'maplibre-gl';
import type {FogField} from '../fog/field';
import type {Grid} from '../fog/grid';
import type {VpId} from '../types';

/** Charted or better, the land the fog has visibly lifted from: contact still lies under most of it, and a
 * rumour alone (Rome's Seres) would stretch the frame across Eurasia. */
const KNOWN = 3;
/** The farthest few per cent of known cells on each side stay out of the frame. */
const TRIM = 0.03;
/** Framed, the known world fills about this share of the view, so the unknown around it stays in sight… */
const FILL = 0.6;
/** …and the frame widens once the known world fills more than this, or spills out of the view. */
const OUTGROWN = 0.85;
const MAX_ZOOM = 4.5;
/** Mercator's poles would swell any frame that reached them. */
const LAT_LIMIT: [number, number] = [-58, 74];
/** A known world with no empty stretch of longitude this wide circles the globe: it centres on home. */
const GLOBAL_GAP = 60;
const CHECK_MS = 500;
const EASE_MS = 2200;

interface Box {
  w: number;
  e: number;
  s: number;
  n: number;
}

/**
 * The auto camera's widening frame: the camera opens on what the viewpoint knows and steps outward as that
 * grows. It never closes in until reset, so a forgotten land (Cathay after 1400) leaves the frame where it
 * was, and the fog pulling back stays visible against a still map between steps.
 */
export class WideningFrame {
  private lon: Float32Array | null = null;
  private lat: Float32Array | null = null;
  private started = false;
  private nextCheck = 0;

  constructor(
    private grid: Grid,
    private field: FogField,
    private map: MlMap,
  ) {}

  /** A new run: the next update frames the known world afresh. */
  reset() {
    this.started = false;
    this.nextCheck = 0;
  }

  update(vps: VpId[], year: number, home: number, padding: PaddingOptions, globe: boolean, now: number) {
    if (now < this.nextCheck) return;
    this.nextCheck = now + CHECK_MS;
    const box = this.knownBox(vps, year, home);
    if (!box) return;
    const {map} = this;
    const zoom = map.getZoom();
    if (this.started) {
      const fill = this.fill(box, padding);
      if (fill === null || fill <= OUTGROWN) return;
    }
    const cam = map.cameraForBounds(
      [
        [box.w, box.s],
        [box.e, box.n],
      ],
      {padding},
    );
    if (!cam || cam.zoom === undefined || !cam.center) return;
    // The globe turns to the known world rather than zooming; the flat map never closes in within a run.
    // Never so far out that the flat map repeats: one world (512 px at zoom 0) spans the view at the widest.
    const widest = Math.max(map.getMinZoom(), Math.log2(map.getContainer().clientWidth / 512));
    let next = Math.min(MAX_ZOOM, Math.max(widest, cam.zoom + Math.log2(FILL)));
    if (globe) next = zoom;
    else if (this.started) next = Math.min(next, zoom);
    this.started = true;
    this.nextCheck = now + EASE_MS + CHECK_MS;
    map.easeTo({center: cam.center, zoom: next, padding, duration: EASE_MS});
  }

  /** How much of the padded view the box fills (1 = edge to edge), or Infinity once any of it spills out. */
  private fill(box: Box, padding: PaddingOptions): number | null {
    const {map} = this;
    const shift = Math.round((map.getCenter().lng - (box.w + box.e) / 2) / 360) * 360;
    const a = map.project([box.w + shift, box.n]);
    const b = map.project([box.e + shift, box.s]);
    if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) return null;
    const el = map.getContainer();
    const left = padding.left ?? 0;
    const right = el.clientWidth - (padding.right ?? 0);
    const top = padding.top ?? 0;
    const bottom = el.clientHeight - (padding.bottom ?? 0);
    if (right - left < 40 || bottom - top < 40) return null;
    const [x0, x1, y0, y1] = [Math.min(a.x, b.x), Math.max(a.x, b.x), Math.min(a.y, b.y), Math.max(a.y, b.y)];
    if (x0 < left || x1 > right || y0 < top || y1 > bottom) return Infinity;
    return Math.max((x1 - x0) / (right - left), (y1 - y0) / (bottom - top));
  }

  /** The trimmed bounds of every cell the viewpoints know at contact or better, unwrapped across 180°. */
  private knownBox(vps: VpId[], year: number, home: number): Box | null {
    this.centres();
    const lon = this.lon!;
    const lat = this.lat!;
    const levels = vps.map(vp => this.field.levelsFor(vp, year).level);
    const xs: number[] = [];
    const ys: number[] = [];
    for (let c = 0; c < this.grid.count; c++) {
      if (!levels.some(l => l[c] >= KNOWN)) continue;
      xs.push(lon[c]);
      ys.push(Math.max(LAT_LIMIT[0], Math.min(LAT_LIMIT[1], lat[c])));
    }
    if (xs.length < 3) return null;
    // Cut the circle of longitudes at its widest empty stretch, so the Pacific is one span, not two.
    xs.sort((a, b) => a - b);
    let cut = xs[0] + 360 - xs[xs.length - 1];
    let start = 0;
    for (let i = 1; i < xs.length; i++) {
      if (xs[i] - xs[i - 1] > cut) {
        cut = xs[i] - xs[i - 1];
        start = i;
      }
    }
    ys.sort((a, b) => a - b);
    const q = (v: number[], f: number) => v[Math.min(v.length - 1, Math.max(0, Math.round(f * (v.length - 1))))];
    const [s, n] = [q(ys, TRIM), q(ys, 1 - TRIM)];
    if (cut < GLOBAL_GAP) return {w: home - 180, e: home + 180, s, n};
    const unwrapped = xs.map((x, i) => (i < start ? x + 360 : x)).sort((a, b) => a - b);
    return {w: q(unwrapped, TRIM), e: q(unwrapped, 1 - TRIM), s, n};
  }

  private centres() {
    if (this.lon) return;
    const n = this.grid.count;
    this.lon = new Float32Array(n);
    this.lat = new Float32Array(n);
    for (let c = 0; c < n; c++) {
      const [la, lo] = cellToLatLng(this.grid.cells[c]);
      this.lat[c] = la;
      this.lon[c] = lo;
    }
  }
}
