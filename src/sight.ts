import {gridDiskDistances, latLngToCell} from 'h3-js';
import {indexOfCell, type Grid} from './fog/grid';
import type {JourneyGeo} from './journey-geo';

/** How clearly a traveller sees a cell, by its distance in cells from the route. */
const STRENGTH = [1, 1, 0.62, 0.3];
const RINGS = STRENGTH.length;

/**
 * What the traveller saw: for every cell and every distance ring, the earliest point in the
 * journey (in stops, fractional along legs) at which the route passes that close.
 */
export class Sight {
  private first: Float32Array;
  readonly seen: Float32Array;

  constructor(
    private grid: Grid,
    geo: JourneyGeo,
  ) {
    this.first = new Float32Array(grid.count * RINGS).fill(Infinity);
    this.seen = new Float32Array(grid.count);
    const visit = (lng: number, lat: number, progress: number) => {
      const id = latLngToCell(Math.max(-89.9, Math.min(89.9, lat)), ((((lng + 180) % 360) + 360) % 360) - 180, grid.res);
      gridDiskDistances(id, RINGS - 1).forEach((ring, d) => {
        for (const cell of ring) {
          const i = indexOfCell(grid, cell);
          if (i < 0) continue;
          const o = i * RINGS + d;
          if (progress < this.first[o]) this.first[o] = progress;
        }
      });
    };
    geo.stops.forEach((st, i) => st.pos && visit(st.pos[0], st.pos[1], i));
    geo.legs.forEach((leg, k) => {
      if (!leg.onMap) return;
      leg.points.forEach((p, i) => visit(p[0], p[1], k + (leg.km > 0 ? leg.cum[i] / leg.km : 1)));
    });
  }

  /** Fill `seen` for a point in the journey and return it. */
  at(progress: number): Float32Array {
    const {first, seen} = this;
    for (let c = 0; c < this.grid.count; c++) {
      let s = 0;
      for (let d = 0; d < RINGS; d++) {
        if (first[c * RINGS + d] <= progress + 1e-6 && STRENGTH[d] > s) s = STRENGTH[d];
      }
      seen[c] = s;
    }
    return seen;
  }
}
