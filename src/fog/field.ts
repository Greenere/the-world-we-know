import {decodeBase64} from '../data';
import type {FogDoc, VpId} from '../types';
import type {Grid} from './grid';

/** How much fog each knowledge level leaves. Level 3 clears coasts but not interiors. */
const FOG_BY_LEVEL = [1, 0.8, 0.6, 0.42, 0.17, 0];
const FOG_COAST_CHARTED = 0.1;
const FOG_SEA_CHARTED = 0.24;

export function fogAmount(level: number, land: boolean, coastal: boolean): number {
  if (level === 3) return coastal ? FOG_COAST_CHARTED : land ? FOG_BY_LEVEL[3] : FOG_SEA_CHARTED;
  return FOG_BY_LEVEL[Math.max(0, Math.min(5, level))];
}

interface Decoded {
  ids: Uint16Array;
  /** Per pattern: flat [year, level, conf, …]. */
  patterns: Float64Array[];
}

export interface CellState {
  level: number;
  conf: number;
}

/** Eased channels per cell. */
const CH = 5;
const SEEN = 4;

/**
 * Turns (viewpoints, year) into fog values per cell, eases them over time so changes
 * cross-fade, and expands them to the mesh's per-vertex values.
 * Per cell: 0 fog for viewpoint A, 1 fog for B (compare), 2 uncertainty, 3 highlight,
 * 4 how clearly the traveller on the current journey has seen it.
 */
export class FogField {
  /** Per vertex: fog A, fog B, uncertainty, highlight. */
  readonly values: Uint8Array;
  /** Per vertex: frontier strength (where the tide line is drawn), seen by the traveller. */
  readonly edges: Uint8Array;
  version = 0;
  private decoded = new Map<VpId, Decoded>();
  private target: Float32Array;
  private current: Float32Array;
  private corner: Float32Array;
  private edge: Float32Array;
  private settled = false;

  constructor(
    private grid: Grid,
    docs: Record<VpId, FogDoc>,
  ) {
    for (const [vp, doc] of Object.entries(docs) as [VpId, FogDoc][]) {
      this.decoded.set(vp, {
        ids: new Uint16Array(decodeBase64(doc.cells).buffer),
        patterns: doc.patterns.map(p => Float64Array.from(p)),
      });
    }
    const n = grid.count;
    this.target = new Float32Array(n * CH);
    this.current = new Float32Array(n * CH);
    this.corner = new Float32Array((grid.mesh.cornerCells.length / 3) * CH);
    this.edge = new Float32Array(n);
    this.values = new Uint8Array(grid.mesh.vertexCount * 4);
    this.edges = new Uint8Array(grid.mesh.vertexCount * 4);
  }

  /** Level and confidence of one cell for one viewpoint in one year. */
  cellState(vp: VpId, cell: number, year: number): CellState {
    const d = this.decoded.get(vp)!;
    return patternAt(d.patterns[d.ids[cell]], year);
  }

  /** The cell's whole history: [year, level, conf][]. */
  cellHistory(vp: VpId, cell: number): [number, number, number][] {
    const d = this.decoded.get(vp)!;
    const p = d.patterns[d.ids[cell]];
    const out: [number, number, number][] = [];
    for (let i = 0; i < p.length; i += 3) out.push([p[i], p[i + 1], p[i + 2]]);
    return out;
  }

  levelsFor(vp: VpId, year: number): {level: Uint8Array; conf: Uint8Array} {
    const d = this.decoded.get(vp)!;
    const pl = new Uint8Array(d.patterns.length);
    const pc = new Uint8Array(d.patterns.length);
    d.patterns.forEach((p, i) => {
      const s = patternAt(p, year);
      pl[i] = s.level;
      pc[i] = s.conf;
    });
    const level = new Uint8Array(this.grid.count);
    const conf = new Uint8Array(this.grid.count);
    for (let c = 0; c < this.grid.count; c++) {
      level[c] = pl[d.ids[c]];
      conf[c] = pc[d.ids[c]];
    }
    return {level, conf};
  }

  /** `seen` is how clearly the traveller on the open journey has seen each cell so far (0–1), or null. */
  setView(vps: VpId[], year: number, highlightRegion: number | null, oral: Set<VpId>, seen: Float32Array | null) {
    const {grid, target} = this;
    const a = this.levelsFor(vps[0], year);
    const b = vps[1] ? this.levelsFor(vps[1], year) : a;
    const oralA = oral.has(vps[0]);
    const oralB = vps[1] ? oral.has(vps[1]) : oralA;
    for (let c = 0; c < grid.count; c++) {
      const land = grid.land[c] === 1;
      const coastal = grid.coastal[c] === 1;
      const o = c * CH;
      target[o] = fogAmount(a.level[c], land, coastal);
      target[o + 1] = fogAmount(b.level[c], land, coastal);
      target[o + 2] = Math.max(uncertainty(a.conf[c], oralA), uncertainty(b.conf[c], oralB));
      target[o + 3] = highlightRegion !== null && grid.region[c] === highlightRegion ? 1 : 0;
      target[o + SEEN] = seen ? seen[c] : 0;
    }
    this.settled = false;
  }

  /** Jump straight to the target (first frame, or when easing would only add lag). */
  snap() {
    this.current.set(this.target);
    this.settled = false;
    this.step(0, 1);
  }

  /** Ease towards the target. Returns true when the vertex values changed. */
  step(dt: number, tau: number): boolean {
    if (this.settled) return false;
    const {current, target} = this;
    const k = tau <= 0 || dt <= 0 ? 1 : 1 - Math.exp(-dt / tau);
    let maxDiff = 0;
    for (let i = 0; i < current.length; i++) {
      const d = target[i] - current[i];
      const ad = d < 0 ? -d : d;
      if (ad > maxDiff) maxDiff = ad;
      current[i] = ad < 0.002 ? target[i] : current[i] + d * k;
    }
    if (maxDiff < 0.002) this.settled = true;
    this.expand();
    this.version++;
    return true;
  }

  private expand() {
    const {mesh} = this.grid;
    const {current, corner, values, edge, edges} = this;
    // Frontier strength per cell: the largest fog difference to any neighbour, in either viewpoint.
    for (let c = 0; c < this.grid.count; c++) {
      let e = 0;
      const a = current[c * CH];
      const b = current[c * CH + 1];
      for (let q = mesh.neighborStart[c]; q < mesh.neighborStart[c + 1]; q++) {
        const o = mesh.neighbors[q] * CH;
        const d = Math.max(Math.abs(current[o] - a), Math.abs(current[o + 1] - b));
        if (d > e) e = d;
      }
      edge[c] = e;
    }
    // Corners take the average of the (up to three) cells that meet there.
    const cc = mesh.cornerCells;
    for (let k = 0; k < cc.length / 3; k++) {
      let n = 0;
      for (let ch = 0; ch < CH; ch++) corner[k * CH + ch] = 0;
      for (let j = 0; j < 3; j++) {
        const c = cc[k * 3 + j];
        if (c < 0) continue;
        n++;
        for (let ch = 0; ch < CH; ch++) corner[k * CH + ch] += current[c * CH + ch];
      }
      for (let ch = 0; ch < CH; ch++) corner[k * CH + ch] /= n;
    }
    const src = mesh.source;
    const out = new Float32Array(CH);
    for (let v = 0; v < mesh.vertexCount; v++) {
      const s = src[v];
      let e = 0;
      if (s >= 0) {
        // Pull the centre a little towards its corners so a lone cell reads as a soft spot, not a hexagon.
        const start = mesh.cellCornerStart[s];
        const end = mesh.cellCornerStart[s + 1];
        for (let ch = 0; ch < CH; ch++) {
          let m = 0;
          for (let q = start; q < end; q++) m += corner[mesh.cellCorners[q] * CH + ch];
          out[ch] = current[s * CH + ch] * 0.7 + (m / (end - start)) * 0.3;
        }
        e = edge[s];
      } else {
        const k = -1 - s;
        for (let ch = 0; ch < CH; ch++) out[ch] = corner[k * CH + ch];
        for (let j = 0; j < 3; j++) {
          const c = cc[k * 3 + j];
          if (c >= 0 && edge[c] > e) e = edge[c];
        }
      }
      values[v * 4] = to8(out[0]);
      values[v * 4 + 1] = to8(out[1]);
      values[v * 4 + 2] = to8(out[2]);
      values[v * 4 + 3] = to8(out[3]);
      edges[v * 4] = to8(e);
      edges[v * 4 + 1] = to8(out[SEEN]);
    }
  }
}

function patternAt(p: Float64Array, year: number): CellState {
  let level = 0;
  let conf = 0;
  for (let i = 0; i < p.length; i += 3) {
    if (p[i] > year) break;
    level = p[i + 1];
    conf = p[i + 2];
  }
  return {level, conf};
}

function uncertainty(conf: number, oral: boolean) {
  const u = conf === 2 ? 1 : conf === 1 ? 0.4 : 0;
  return oral ? Math.max(u, 0.45) : u;
}

function to8(x: number) {
  return x <= 0 ? 0 : x >= 1 ? 255 : (x * 255 + 0.5) | 0;
}
