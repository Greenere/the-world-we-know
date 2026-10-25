import type {VpId} from './types';
import {ALL_VPS} from './types';

export type Panel = 'none' | 'journeys' | 'about';

export interface State {
  /** One viewpoint, or two in compare mode. */
  vps: VpId[];
  compare: boolean;
  year: number;
  playing: boolean;
  speed: number;
  /** Timeline playback: show every journey under way, slowing to `journeySpeed` while one is. */
  allJourneys: boolean;
  journeySpeed: number;
  scrubbing: boolean;
  journey: string | null;
  /** Position along the journey, in stops (fractional while travelling). */
  progress: number;
  /** Journey camera: keep the traveller centred (default), or frame the whole route. */
  follow: boolean;
  region: string | null;
  regionCell: number | null;
  city: string | null;
  invention: string | null;
  globe: boolean;
  panel: Panel;
  search: boolean;
}

type Listener = (state: State, prev: State) => void;

export class Store {
  state: State;
  private listeners: Listener[] = [];

  /** `normalize` derives dependent fields (year from journey progress, clamping) before anyone is told. */
  constructor(
    initial: State,
    private normalize: (next: State, prev: State) => State = s => s,
  ) {
    this.state = initial;
  }

  set(patch: Partial<State>) {
    const prev = this.state;
    let changed = false;
    for (const k of Object.keys(patch) as (keyof State)[]) {
      if (prev[k] !== patch[k]) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    const next = this.normalize({...prev, ...patch}, prev);
    this.state = next;
    for (const l of this.listeners) l(next, prev);
  }

  subscribe(fn: Listener) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn);
    };
  }
}

export const DEFAULT_STATE: State = {
  vps: ['china'],
  compare: false,
  year: 1420,
  playing: false,
  speed: 1,
  allJourneys: false,
  journeySpeed: 0.05,
  scrubbing: false,
  journey: null,
  progress: 0,
  follow: true,
  region: null,
  regionCell: null,
  city: null,
  invention: null,
  globe: false,
  panel: 'none',
  search: false,
};

/** ?vp=china&year=1420 · ?vp=europe,china&year=1420 · ?journey=zhenghe&stop=4 · ?region=…&vp=… · ?city=loulan · ?invention=compass&year=1100 */
export function readUrl(): Partial<State> & {stop?: number} {
  const q = new URLSearchParams(location.search);
  const out: Partial<State> & {stop?: number} = {};
  const vps = (q.get('vp') ?? '')
    .split(',')
    .map(s => s.trim())
    .filter((s): s is VpId => (ALL_VPS as string[]).includes(s));
  if (vps.length) {
    out.vps = [...new Set(vps)].slice(0, 2);
    out.compare = out.vps.length === 2;
  }
  const year = Number(q.get('year'));
  if (q.has('year') && Number.isFinite(year)) out.year = year;
  if (q.get('journey')) out.journey = q.get('journey');
  const stop = Number(q.get('stop'));
  if (q.has('stop') && Number.isFinite(stop)) out.stop = Math.max(1, Math.round(stop));
  if (q.get('region')) out.region = q.get('region');
  if (q.get('city')) out.city = q.get('city');
  if (q.get('invention')) out.invention = q.get('invention');
  if (q.get('globe') === '1') out.globe = true;
  if (q.get('view') === 'route') out.follow = false;
  if (q.get('journeys') === 'all') out.allJourneys = true;
  return out;
}

export function writeUrl(s: State, currentStop: number | null) {
  const q = new URLSearchParams();
  if (s.journey) {
    q.set('journey', s.journey);
    if (currentStop !== null) q.set('stop', String(currentStop + 1));
    if (!s.follow) q.set('view', 'route');
  } else {
    q.set('vp', s.vps.join(','));
    q.set('year', String(Math.round(s.year)));
  }
  if (s.region) {
    q.set('region', s.region);
    if (s.journey) q.set('vp', s.vps.join(','));
  }
  if (s.city) q.set('city', s.city);
  if (s.invention) q.set('invention', s.invention);
  if (s.globe) q.set('globe', '1');
  if (s.allJourneys && !s.journey) q.set('journeys', 'all');
  const url = `${location.pathname}?${q.toString().replace(/%2C/g, ',')}`;
  if (url !== location.pathname + location.search) history.replaceState(null, '', url);
}
