// Shapes of the files written by scripts/build_data.py.

export type VpId = 'europe' | 'china' | 'islam' | 'polynesia' | 'india' | 'japan' | 'sahel' | 'mexica' | 'inca' | 'persia' | 'egypt' | 'arabia' | 'maghreb' | 'humanity';
export const MAIN_VPS: VpId[] = ['europe', 'china', 'islam', 'polynesia', 'india', 'japan', 'sahel', 'mexica', 'inca', 'persia', 'egypt', 'arabia', 'maghreb'];
export const ALL_VPS: VpId[] = [...MAIN_VPS, 'humanity'];

export interface Home {
  from: number;
  place: string;
  lat: number;
  lon: number;
  note?: string;
}

export interface Moment {
  year: number;
  label: string;
  source: string;
}

export interface Viewpoint {
  id: VpId;
  name: string;
  longName: string;
  adjective: string;
  color: string;
  seal: string;
  homes: Home[];
  moments: Moment[];
  startNote?: string;
  /** Show the start note until this year: while the view still follows the forerunners it names. */
  noteUntil?: number;
  /** A knowledge community (the Islamic world): it knows what each member knows from the year it joins,
   * and keeps it. Its fog is built that way; members still have their own viewpoints. */
  community?: {members: {viewpoint: VpId; from: number}[]};
  special?: boolean;
  oral?: boolean;
}

export interface NameEntry {
  vp: VpId | '*';
  name: string;
  native?: string;
  from?: number;
  to?: number;
  source?: string;
}

export interface RegionEvent {
  y: number | [number, number];
  level: number;
  cap?: boolean;
  conf: number;
  source: string;
  note?: string;
  journey?: string;
}

export interface Region {
  id: string;
  name: string;
  surface: 'any' | 'land' | 'sea' | 'space';
  label: [number, number] | null;
  cells: number;
  parents: string[];
  /** Every larger region holding most of this one's cells (Sahara → Africa; ice sheet → Greenland). */
  within: string[];
  names: NameEntry[];
  events: Partial<Record<VpId | '*', RegionEvent[]>>;
  journeys: string[];
  body?: 'orbit' | 'moon';
  hidden?: boolean;
}

export type CityDateKey = 'founded' | 'peak' | 'abandoned' | 'forgotten' | 'rediscovered';

/** An imagined sketch of a subject (a city, for now) in one era, with what that era was like and how each
 * viewpoint saw it. Fetched per subject when its card opens. */
export interface Depiction {
  id: string;
  /** A city's era: the years it covers. */
  from?: number;
  to?: number;
  /** A journey's scene: the stop it shows (index among the non-waypoint stops) and its place. */
  stop?: number;
  place?: string;
  title: string;
  caption: string;
  captions?: Partial<Record<VpId, string>>;
  sources: string[];
  confidence: string;
  img: {thumb: string; card: string; full: string};
  placeholder?: boolean;
  made?: {provider?: string; model?: string; date?: string};
}

export type DepictionKind = 'city' | 'journey';

export interface DepictionDoc {
  kind: DepictionKind;
  id: string;
  /** A city's eras, or a journey's scenes, in order. */
  eras?: Depiction[];
  scenes?: Depiction[];
}

export interface City {
  id: string;
  lat: number;
  lon: number;
  tier: 1 | 2 | 3;
  cell: number;
  dates: Partial<Record<CityDateKey, number | [number, number]>>;
  source: string;
  confidence: 'high' | 'medium' | 'low';
  story?: string;
  names: NameEntry[];
  journeys: string[];
  region: number | null;
  /** Number of era pictures in depictions/city/<id>.json. */
  pictures?: number;
}

export type Body = 'orbit' | 'moon' | 'moon-orbit';

export interface Stop {
  year?: number;
  place?: string;
  lat?: number;
  lon?: number;
  note?: string;
  source?: string;
  confidence?: string;
  date?: string;
  waypoint?: boolean;
  from?: string;
  by?: 'sea' | 'land' | 'river' | 'direct';
  body?: Body;
  city?: string;
}

export interface Inform {
  region: string;
  level: number;
  homeKnows: number | string;
  homeKnowsMid: number;
  confidence: string;
  viewpoint: VpId;
  source?: string;
  note?: string;
}

export interface Journey {
  id: string;
  name: string;
  traveler?: string;
  years: string;
  kind: string;
  viewpoint: VpId;
  summary: string;
  source: string;
  confidence: string;
  stops: Stop[];
  informs: Inform[];
  lifts: string[];
  space?: 'orbit' | 'moon';
  globe?: boolean;
  /** Where to point the globe for journeys that only make sense on it. */
  focus?: [number, number];
  /** Routed path into each (non-waypoint) stop from where its leg starts; null for the first stop and off-map legs. */
  route: ([number, number][] | null)[];
  /** Number of scene pictures in depictions/journey/<id>.json. */
  pictures?: number;
  /** Fractional year of each (non-waypoint) stop: the clock every journey shares. */
  t: number[];
  crossings: Crossing[];
}

/** Two journeys close in place and time, computed by the build. */
export interface Crossing {
  kind: 'meanwhile' | 'same place';
  journey: string;
  /** When this journey was there, and when the other was. */
  t: number;
  otherT: number;
  km: number;
  place: string;
  otherPlace: string;
}

/** A traveller's several journeys, listed as one row. */
export interface Series {
  id: string;
  name: string;
  journeys: string[];
}

export interface FogDoc {
  vp: VpId;
  /** One flat [year, level, confidence, year, level, confidence, …] list per distinct cell history. */
  patterns: number[][];
  /** Base64 Uint16: pattern index per cell. */
  cells: string;
}

export interface GridDoc {
  res: number;
  count: number;
  first: string;
  last: string;
  /** Base64 Uint8: bit 0 land, bit 1 coastal. */
  flags: string;
  /** Base64 Uint16: smallest named region per cell (0xffff = none). */
  region: string;
}

export type Beyond = Record<string, Record<VpId, [number, number, number][]>>;

export interface Source {
  citation: string;
  url?: string;
}

export type InventionCategory = 'navigation' | 'measurement' | 'mapping' | 'communication' | 'transport' | 'imaging';

export interface Invention {
  id: string;
  year: number | [number, number];
  /** Midpoint of `year`, for placing on the timeline. */
  mid: number;
  name: string;
  native?: string;
  place: string;
  lat: number;
  lon: number;
  /** The viewpoint it belongs to, when one fits; otherwise `culture` names who made it. */
  vp?: VpId;
  culture?: string;
  category: InventionCategory;
  summary: string;
  changed: string;
  source: string;
  confidence: string;
}

export interface SearchEntry {
  t: 'region' | 'city' | 'journey' | 'invention';
  id: string;
  label: string;
  alt: string[];
}

export const LEVEL_NAMES = ['Unknown', 'Rumor', 'Contact', 'Coast charted', 'Interior mapped', 'Surveyed'];
export const HUMANITY_LEVEL_NAMES = ['No one yet', 'No one yet', 'Reached by machine', 'Reached', 'Visited and lived in', 'Inhabited'];
export const CONFIDENCE_NAMES = ['high', 'medium', 'low'];
