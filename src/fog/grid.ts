import {cellToChildren, cellToLatLng, cellToVertexes, getRes0Cells, latLngToCell, vertexToLatLng} from 'h3-js';
import {decodeBase64} from '../data';
import type {GridDoc} from '../types';

/**
 * The H3 grid as a triangle mesh: every cell is a fan of triangles around its centre.
 * Centre vertices carry the cell's own fog; corner vertices carry the average of the
 * (up to three) cells that meet there, so the GPU blends neighbouring cells smoothly.
 */
export interface FogMesh {
  positions: Float32Array; // [lng, lat] per vertex, longitudes unwrapped per cell
  indices: Uint32Array;
  /** For each mesh vertex: the cell index (centre) or -1 - corner index (corner). */
  source: Int32Array;
  /** Per corner: up to three cell indices, -1 padded. */
  cornerCells: Int32Array;
  /** Per cell: offset and count of its corners in cellCorners. */
  cellCornerStart: Uint32Array;
  cellCorners: Int32Array;
  /** Per cell: offset and count of its neighbours in neighbors (cells sharing a corner). */
  neighborStart: Uint32Array;
  neighbors: Int32Array;
  vertexCount: number;
}

export interface Grid {
  res: number;
  count: number;
  cells: string[];
  land: Uint8Array;
  coastal: Uint8Array;
  region: Uint16Array;
  mesh: FogMesh;
}

export function buildGrid(doc: GridDoc): Grid {
  const cells = getRes0Cells()
    .flatMap(c => cellToChildren(c, doc.res))
    .sort();
  if (cells.length !== doc.count || cells[0] !== doc.first || cells[cells.length - 1] !== doc.last) {
    throw new Error('Grid mismatch between the build and h3-js; rebuild the data.');
  }
  const flags = decodeBase64(doc.flags);
  const region = new Uint16Array(decodeBase64(doc.region).buffer);
  const land = new Uint8Array(cells.length);
  const coastal = new Uint8Array(cells.length);
  for (let i = 0; i < cells.length; i++) {
    land[i] = flags[i] & 1;
    coastal[i] = (flags[i] >> 1) & 1;
  }
  return {res: doc.res, count: cells.length, cells, land, coastal, region, mesh: buildMesh(cells)};
}

function buildMesh(cells: string[]): FogMesh {
  let vertexCount = 0;
  let triCount = 0;
  const corners: string[][] = new Array(cells.length);
  for (let i = 0; i < cells.length; i++) {
    const v = cellToVertexes(cells[i]);
    corners[i] = v;
    vertexCount += v.length + 1;
    triCount += v.length;
  }
  const positions = new Float32Array(vertexCount * 2);
  const indices = new Uint32Array(triCount * 3);
  const source = new Int32Array(vertexCount);
  const cellCornerStart = new Uint32Array(cells.length + 1);
  const cellCorners = new Int32Array(triCount);
  const cornerIndex = new Map<string, number>();
  const cornerLists: number[][] = [];

  let v = 0;
  let t = 0;
  let cc = 0;
  for (let i = 0; i < cells.length; i++) {
    const [clat, clng] = cellToLatLng(cells[i]);
    const base = v;
    positions[v * 2] = clng;
    positions[v * 2 + 1] = clat;
    source[v++] = i;
    cellCornerStart[i] = cc;
    const vs = corners[i];
    for (const id of vs) {
      const [lat, lng0] = vertexToLatLng(id);
      let lng = lng0;
      while (lng - clng > 180) lng -= 360;
      while (clng - lng > 180) lng += 360;
      positions[v * 2] = lng;
      positions[v * 2 + 1] = lat;
      let k = cornerIndex.get(id);
      if (k === undefined) {
        k = cornerLists.length;
        cornerIndex.set(id, k);
        cornerLists.push([]);
      }
      cornerLists[k].push(i);
      cellCorners[cc++] = k;
      source[v++] = -1 - k;
    }
    const n = vs.length;
    for (let j = 0; j < n; j++) {
      indices[t++] = base;
      indices[t++] = base + 1 + j;
      indices[t++] = base + 1 + ((j + 1) % n);
    }
  }
  cellCornerStart[cells.length] = cc;
  const cornerCells = new Int32Array(cornerLists.length * 3).fill(-1);
  cornerLists.forEach((list, k) => list.slice(0, 3).forEach((c, j) => (cornerCells[k * 3 + j] = c)));
  const neighborStart = new Uint32Array(cells.length + 1);
  const nb: number[] = [];
  for (let i = 0; i < cells.length; i++) {
    neighborStart[i] = nb.length;
    const seen = new Set<number>();
    for (let q = cellCornerStart[i]; q < cellCornerStart[i + 1]; q++) {
      for (const c of cornerLists[cellCorners[q]]) if (c !== i) seen.add(c);
    }
    nb.push(...seen);
  }
  neighborStart[cells.length] = nb.length;
  const neighbors = Int32Array.from(nb);
  return {positions, indices, source, cornerCells, cellCornerStart, cellCorners, neighborStart, neighbors, vertexCount};
}

/** Index of the cell under a point. */
export function cellAt(grid: Grid, lat: number, lng: number): number {
  return indexOfCell(grid, latLngToCell(Math.max(-89.99, Math.min(89.99, lat)), ((((lng + 180) % 360) + 360) % 360) - 180, grid.res));
}

/** Index of an H3 cell id, by binary search over the sorted cell list. */
export function indexOfCell(grid: Grid, id: string): number {
  let lo = 0;
  let hi = grid.cells.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = grid.cells[mid];
    if (c === id) return mid;
    if (c < id) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}
