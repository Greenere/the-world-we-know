import {t, tx} from './i18n';
import type {Journey, Stop} from './types';

export type LngLat = [number, number];

export interface JStop {
  /** Position in the journey's stops array. */
  raw: number;
  stop: Stop;
  /** The year as authored (for labels). */
  year: number;
  /** The shared clock: a fractional year. */
  t: number;
  /** Unwrapped position, or null for stops beyond the map (the Moon, lunar orbit). */
  pos: LngLat | null;
}

export interface Leg {
  from: number;
  to: number;
  points: LngLat[];
  cum: number[];
  km: number;
  onMap: boolean;
  /** Starts somewhere other than the previous stop (a new branch of a group voyage). */
  branch: boolean;
}

export interface JourneyGeo {
  journey: Journey;
  stops: JStop[];
  legs: Leg[];
  /** Latest "home knows" date: when news of the last stop reaches home. */
  homeKnows: number;
  epilogue: boolean;
  bounds: [LngLat, LngLat] | null;
}

const R = 6371;

export function km(a: LngLat, b: LngLat) {
  const p1 = (a[1] * Math.PI) / 180;
  const p2 = (b[1] * Math.PI) / 180;
  const dp = p2 - p1;
  const dl = ((b[0] - a[0]) * Math.PI) / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Insert points so no segment spans more than `step` degrees. */
function densify(points: LngLat[], step = 1): LngLat[] {
  const out: LngLat[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (i > 0) {
      const q = points[i - 1];
      const n = Math.ceil(Math.max(Math.abs(p[0] - q[0]), Math.abs(p[1] - q[1])) / step);
      for (let k = 1; k < n; k++) out.push([q[0] + ((p[0] - q[0]) * k) / n, q[1] + ((p[1] - q[1]) * k) / n]);
    }
    out.push(p);
  }
  return out;
}

function unwrap(lon: number, ref: number) {
  let l = lon;
  while (l - ref > 180) l -= 360;
  while (ref - l > 180) l += 360;
  return l;
}

const onMapStop = (s: Stop) => s.lat !== undefined && s.lon !== undefined && s.body !== 'moon' && s.body !== 'moon-orbit';

export function buildJourneyGeo(j: Journey): JourneyGeo {
  const stops: JStop[] = [];
  const legs: Leg[] = [];
  let pending: LngLat[] = [];
  let branchFrom: number | null = null;
  let ref = j.stops.find(onMapStop)?.lon ?? 0;
  const byPlace = new Map<string, number>();

  j.stops.forEach((s, raw) => {
    if (s.from) {
      const k = byPlace.get(s.from);
      if (k !== undefined) {
        branchFrom = k;
        pending = [];
        const p = stops[k].pos;
        if (p) ref = p[0];
      }
    }
    if (s.waypoint) {
      const lon = unwrap(s.lon!, ref);
      pending.push([lon, s.lat!]);
      ref = lon;
      return;
    }
    let pos: LngLat | null = null;
    if (onMapStop(s)) {
      const lon = unwrap(s.lon!, ref);
      pos = [lon, s.lat!];
      ref = lon;
    }
    const index = stops.length;
    const year = s.year ?? stops[index - 1]?.year ?? 0;
    stops.push({raw, stop: s, year, t: j.t?.[index] ?? year, pos});
    if (index > 0) {
      const fromIdx = branchFrom ?? index - 1;
      const start = stops[fromIdx].pos;
      const onMap = !!start && !!pos;
      const routed = j.route?.[index];
      let points: LngLat[] = [];
      if (onMap && routed && routed.length > 1) {
        // The build routes legs with longitudes unwrapped from their own start; shift onto ours.
        const shift = Math.round((start![0] - routed[0][0]) / 360) * 360;
        points = densify(routed.map(([x, y]) => [x + shift, y] as LngLat));
        points[0] = start!;
        pos = [points[points.length - 1][0], pos![1]];
        stops[index].pos = pos;
        points[points.length - 1] = pos;
        ref = pos[0];
      } else if (onMap) {
        points = densify([start!, ...pending, pos!]);
      }
      const cum = [0];
      for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + km(points[i - 1], points[i]));
      legs.push({from: index - 1, to: index, points, cum, km: cum[cum.length - 1] ?? 0, onMap, branch: branchFrom !== null});
    }
    if (s.place) byPlace.set(s.place, index);
    pending = [];
    branchFrom = null;
  });

  const lastYear = stops[stops.length - 1]?.t ?? 0;
  const homeKnows = Math.max(lastYear, ...j.informs.map(i => i.homeKnowsMid));
  const pts = stops.filter(s => s.pos).map(s => s.pos!) as LngLat[];
  for (const l of legs) pts.push(...l.points);
  let bounds: [LngLat, LngLat] | null = null;
  if (pts.length) {
    const xs = pts.map(p => p[0]);
    const ys = pts.map(p => Math.max(-80, Math.min(80, p[1])));
    bounds = [
      [Math.min(...xs), Math.min(...ys)],
      [Math.max(...xs), Math.max(...ys)],
    ];
  }
  return {journey: j, stops, legs, homeKnows, epilogue: homeKnows > lastYear + 0.4, bounds};
}

/** Number of steps the stepper walks through: every stop, plus "news reaches home" if later. */
export function stepCount(g: JourneyGeo) {
  return g.stops.length + (g.epilogue ? 1 : 0);
}

export function yearAt(g: JourneyGeo, progress: number): number {
  const n = g.stops.length;
  if (progress <= 0) return g.stops[0].t;
  if (progress >= n - 1) {
    if (!g.epilogue) return g.stops[n - 1].t;
    const f = Math.min(1, progress - (n - 1));
    return g.stops[n - 1].t + (g.homeKnows - g.stops[n - 1].t) * f;
  }
  const k = Math.floor(progress);
  const f = progress - k;
  return g.stops[k].t + (g.stops[k + 1].t - g.stops[k].t) * f;
}

/** The latest point in the journey whose time is at or before `year`. */
export function progressForYear(g: JourneyGeo, year: number, epilogue = true): number {
  const n = g.stops.length;
  if (year <= g.stops[0].t) return 0;
  for (let k = 0; k < n - 1; k++) {
    const a = g.stops[k].t;
    const b = g.stops[k + 1].t;
    if (year < b) return b > a ? k + (year - a) / (b - a) : k;
  }
  if (epilogue && g.epilogue && year > g.stops[n - 1].t) {
    return n - 1 + Math.min(1, (year - g.stops[n - 1].t) / (g.homeKnows - g.stops[n - 1].t));
  }
  return n - 1;
}

/** First and last moment of the journey itself (not counting the news reaching home). */
export function span(g: JourneyGeo): [number, number] {
  return [g.stops[0].t, g.stops[g.stops.length - 1].t];
}

/** Where a journey's traveller is in a given year (by the shared clock), with the trail so far. */
export function atYear(g: JourneyGeo, year: number) {
  const progress = progressForYear(g, year, false);
  return {progress, ...travelled(g, progress)};
}

/** Where the traveller is: at a stop, or on the way to the next one. */
export function placeAt(g: JourneyGeo, progress: number): string {
  const k = currentStopIndex(g, progress);
  const id = g.journey.id;
  const at = tx.stop(id, k, 'place', g.stops[k].stop.place ?? '');
  const next = g.stops[k + 1]?.stop.place;
  return progress - k > 0.15 && next ? t('bound for {place}', {place: tx.stop(id, k + 1, 'place', next)}) : t('at {place}', {place: at});
}

function along(leg: Leg, f: number): {point: LngLat; idx: number} {
  const target = leg.km * f;
  let i = 1;
  while (i < leg.cum.length - 1 && leg.cum[i] < target) i++;
  const a = leg.points[i - 1];
  const b = leg.points[i];
  const seg = leg.cum[i] - leg.cum[i - 1];
  const t = seg > 0 ? (target - leg.cum[i - 1]) / seg : 1;
  return {point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], idx: i};
}

/** Where the traveller is, and the trail travelled so far. */
export function travelled(g: JourneyGeo, progress: number): {pos: LngLat | null; trail: LngLat[][]} {
  const trail: LngLat[][] = [];
  const n = g.stops.length;
  const p = Math.min(progress, n - 1);
  const k = Math.floor(p);
  const f = p - k;
  for (let i = 0; i < Math.min(k, g.legs.length); i++) if (g.legs[i].onMap) trail.push(g.legs[i].points);
  let pos: LngLat | null = g.stops[Math.min(k, n - 1)].pos;
  if (k < n - 1 && f > 0) {
    const leg = g.legs[k];
    if (leg.onMap) {
      const {point, idx} = along(leg, f);
      trail.push([...leg.points.slice(0, idx), point]);
      pos = point;
    } else {
      pos = f < 0.5 ? g.stops[k].pos : g.stops[k + 1].pos;
    }
  }
  return {pos, trail};
}

/** Seconds to travel a leg at 1× speed. */
export function legDuration(leg: Leg | undefined) {
  if (!leg || !leg.onMap) return 1.6;
  return Math.min(5, Math.max(1.1, 0.8 + Math.sqrt(leg.km) / 28));
}

export function currentStopIndex(g: JourneyGeo, progress: number) {
  return Math.min(g.stops.length - 1, Math.floor(progress + 1e-6));
}
