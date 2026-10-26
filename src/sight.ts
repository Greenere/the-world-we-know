import {gridDiskDistances, latLngToCell} from 'h3-js';
import {indexOfCell, type Grid} from './fog/grid';
import type {JourneyGeo} from './journey-geo';
import {yearAt} from './journey-geo';

/** How clearly a traveller sees a cell, by its distance in cells from the route. */
const STRENGTH = [1, 1, 0.62, 0.3];
const RINGS = STRENGTH.length;

/**
 * What the traveller saw: for every cell and every distance ring, the earliest moment (by the shared clock)
 * at which any party's route passes that close. Parties travelling at once see at once.
 */
export class Sight {
  private first: Float32Array;
  readonly seen: Float32Array;

  constructor(
    private grid: Grid,
    private geo: JourneyGeo,
  ) {
    this.first = new Float32Array(grid.count * RINGS).fill(Infinity);
    this.seen = new Float32Array(grid.count);
    const visit = (lng: number, lat: number, year: number) => {
      const id = latLngToCell(Math.max(-89.9, Math.min(89.9, lat)), ((((lng + 180) % 360) + 360) % 360) - 180, grid.res);
      gridDiskDistances(id, RINGS - 1).forEach((ring, d) => {
        for (const cell of ring) {
          const i = indexOfCell(grid, cell);
          if (i < 0) continue;
          const o = i * RINGS + d;
          if (year < this.first[o]) this.first[o] = year;
        }
      });
    };
    geo.stops.forEach(st => st.pos && visit(st.pos[0], st.pos[1], st.t));
    geo.legs.forEach(leg => {
      if (!leg.onMap) return;
      leg.points.forEach((p, i) => visit(p[0], p[1], leg.t0 + (leg.t1 - leg.t0) * (leg.km > 0 ? leg.cum[i] / leg.km : 1)));
    });
  }

  /** Fill `seen` for a point in the journey and return it. */
  at(progress: number): Float32Array {
    const {first, seen} = this;
    const year = yearAt(this.geo, progress);
    for (let c = 0; c < this.grid.count; c++) {
      let s = 0;
      for (let d = 0; d < RINGS; d++) {
        if (first[c * RINGS + d] <= year + 1e-6 && STRENGTH[d] > s) s = STRENGTH[d];
      }
      seen[c] = s;
    }
    return seen;
  }
}
