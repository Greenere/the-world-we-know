/**
 * The journey timeline as a ribbon: every stop gets some room, time between stops stretches the line, and a long
 * stretch with no stops (six years at Kublai's court) folds into a short break that says how long it was. The
 * line can end with the news reaching home.
 *
 * Positions are in pixels along a track of `width`. Progress is the journey's stepping progress: stop index,
 * fractional between stops, with one more step for the news reaching home when the journey has it.
 */

export interface RibbonFold {
  /** The stop before the fold. */
  after: number;
  /** Years folded away. */
  years: number;
  x0: number;
  x1: number;
}

export interface Ribbon {
  /** Each step's position: the stops, then the news reaching home when there is one. */
  xs: number[];
  folds: RibbonFold[];
  /** The stretch from the last stop to the news reaching home. */
  home: {x0: number; x1: number} | null;
  width: number;
}

/** A gap folds when it is this many years or more... */
const FOLD_YEARS = 1.5;
/** ...and this many times the journey's usual gap between stops. */
const FOLD_RATIO = 6;
/** A stretch between stops counts at most this many usual gaps, so one slow leg can't swallow the line. */
const MAX_GAPS = 6;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Lay out stops at times `t` (fractional years) along `width` pixels. */
export function ribbonLayout(t: number[], width: number, epilogue: boolean): Ribbon {
  const n = t.length;
  const gaps = t.slice(1).map((v, i) => Math.max(0, v - t[i]));
  // The usual gap: what one step of this journey takes. A journey that happens all at once spaces stops evenly.
  const usual = median(gaps.filter(g => g > 0)) || 1;
  const folded = gaps.map(g => g >= FOLD_YEARS && g >= FOLD_RATIO * usual);
  const weights = gaps.map((g, i) => (folded[i] ? 0 : 1 + Math.min(g / usual, MAX_GAPS)));
  const nFolds = folded.filter(Boolean).length;
  let foldW = clamp(width * 0.055, 40, 72);
  const homeW = epilogue ? clamp(width * 0.07, 56, 96) : 0;
  // Stops keep at least half the track, however many folds there are.
  if (nFolds) foldW = Math.min(foldW, (width - homeW) * 0.5 / nFolds);
  const total = weights.reduce((a, b) => a + b, 0);
  const travel = Math.max(0, width - homeW - nFolds * foldW);
  const per = total > 0 ? travel / total : 0;
  const xs = [0];
  const folds: RibbonFold[] = [];
  let x = 0;
  gaps.forEach((g, i) => {
    if (folded[i]) {
      folds.push({after: i, years: g, x0: x, x1: x + foldW});
      x += foldW;
    } else x += weights[i] * per;
    xs.push(x);
  });
  // A single stop, or stops all at the same moment with nothing else: put the line's end at the right edge.
  if (n > 1 && total === 0 && !nFolds) xs.forEach((_, i) => (xs[i] = (i / (n - 1)) * (width - homeW)));
  const home = epilogue ? {x0: xs[n - 1], x1: width} : null;
  if (home) xs.push(width);
  return {xs, folds, home, width};
}

/** Where a stepping progress sits along the ribbon. */
export function ribbonX(r: Ribbon, progress: number): number {
  const last = r.xs.length - 1;
  const p = clamp(progress, 0, last);
  const i = Math.min(last - 1, Math.floor(p));
  if (i < 0) return r.xs[0] ?? 0;
  return r.xs[i] + (r.xs[i + 1] - r.xs[i]) * (p - i);
}

/** The stepping progress at a position along the ribbon. */
export function ribbonProgress(r: Ribbon, x: number): number {
  const xs = r.xs;
  if (xs.length < 2 || x <= xs[0]) return 0;
  for (let i = 0; i < xs.length - 1; i++) {
    if (x <= xs[i + 1]) return xs[i + 1] > xs[i] ? i + (x - xs[i]) / (xs[i + 1] - xs[i]) : i + 1;
  }
  return xs.length - 1;
}

/** Where a year falls along the ribbon, by the stops' times (and `home`, the year the news arrives), or null outside them. */
export function ribbonXAtYear(r: Ribbon, t: number[], home: number | null, year: number): number | null {
  const ts = r.home && home !== null ? [...t, home] : t;
  for (let i = 0; i < ts.length - 1; i++) {
    if (year >= ts[i] && year <= ts[i + 1]) return r.xs[i] + (r.xs[i + 1] - r.xs[i]) * (ts[i + 1] > ts[i] ? (year - ts[i]) / (ts[i + 1] - ts[i]) : 0);
  }
  return null;
}
