// Shapes of the files written by scripts/build_data.py.

export type VpId = 'europe' | 'china' | 'islam' | 'polynesia' | 'india' | 'japan' | 'sahel' | 'mexica' | 'inca' | 'persia' | 'egypt' | 'arabia' | 'maghreb' | 'greece' | 'rome' | 'iberia' | 'france' | 'britain' | 'germany' | 'norse' | 'russia' | 'inuit' | 'zimbabwe' | 'ethiopia' | 'swahili' | 'nusantara' | 'korea' | 'steppe' | 'maya' | 'humanity';
export const MAIN_VPS: VpId[] = ['europe', 'china', 'islam', 'polynesia', 'india', 'japan', 'sahel', 'mexica', 'inca', 'persia', 'egypt', 'arabia', 'maghreb', 'greece', 'rome', 'iberia', 'france', 'britain', 'germany', 'norse', 'russia', 'inuit', 'zimbabwe', 'ethiopia', 'swahili', 'nusantara', 'korea', 'steppe', 'maya'];
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
  /** One sentence on who this viewpoint is, for the picker. */
  tagline: string;
  color: string;
  seal: string;
  homes: Home[];
  moments: Moment[];
  startNote?: string;
  /** Show the start note until this year: while the view still follows the forerunners it names. */
  noteUntil?: number;
  /** A knowledge community (the Islamic world): it knows what each member knows from the year it joins,
   * and keeps it. Its fog is built that way; members still have their own viewpoints. */
  community?: {members: {viewpoint: VpId; from: number; until?: number}[]};
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

/** An imagined city era, journey scene, invention or landscape study. Fetched when its card opens. */
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

export type DepictionKind = 'city' | 'journey' | 'invention' | 'natural' | 'built';

export interface DepictionDoc {
  kind: DepictionKind;
  id: string;
  /** A city's eras, a journey's scenes, or standalone invention, landscape or architectural studies. */
  eras?: Depiction[];
  scenes?: Depiction[];
  studies?: Depiction[];
}

/** How a landmark's course is drawn: a wall, a canal, or a canyon's river. */
export type PathStyle = 'wall' | 'canal' | 'river';

/** One age of a landmark built, abandoned and rebuilt along new lines (the Great Wall under each dynasty). */
export interface Phase {
  id: string;
  name: string;
  from: number;
  /** Open-ended for the last. */
  to?: number;
  /** An age that built nothing and let the old works fall. */
  idle?: boolean;
  /** Where the landmark's mark stands in this age. */
  anchor: [number, number];
  note: string;
  /** The courses this age built; drawn in ink while it lasts, faint after. */
  paths: [number, number][][];
}

export interface City {
  id: string;
  lat: number;
  lon: number;
  tier: 1 | 2 | 3;
  /** A landmark rather than a city: something built (a pyramid, a canal) or a natural wonder. */
  kind?: 'built' | 'natural';
  /** A natural landmark's map sign; water has none, its name is lettered on the water. */
  subtype?: 'peak' | 'volcano' | 'falls' | 'gorge' | 'rock' | 'pool' | 'water';
  /** The course of a landmark that runs along a line, and how to draw it: a wall, a canal, a canyon's river. */
  path?: {
    style: PathStyle;
    points?: [number, number][];
    phases?: Phase[];
    /** When an age ends its works stand as fading ruins (a wall), or vanish (a canal silts up and is gone). */
    ended?: 'fade' | 'vanish';
  };
  /** A landmark that covers ground (a desert, a delta, a lake the basemap lacks): how it is engraved, its outline
   * (dated outlines for one that changes, like the shrinking Aral Sea), and the stipple of a land texture. */
  area?: {
    texture: 'sand' | 'salt' | 'marsh' | 'upland' | 'water';
    outlines: {from?: number; polygons: [number, number][][]}[];
    stipple?: [number, number][];
  };
  /** A reef that is many reefs (the Great Barrier Reef): each one's traced line. */
  reefs?: [number, number][][];
  /** For a landmark: the year a viewpoint came upon the place itself, when long after it knew the land around it. */
  found?: Partial<Record<VpId, number>>;
  /** For a landmark: when it became known beyond its neighbours, so that mere contact with the land sufficed. */
  widely?: number;
  /** For a wonder within a city (the Alhambra): that city, whose mark and card carry it. */
  host?: string;
  /** For a city: the wonders that stand in it. */
  wonders?: string[];
  /** For a city: the inventions made in it. */
  inventions?: string[];
  cell: number;
  dates: Partial<Record<CityDateKey, number | [number, number]>>;
  source: string;
  confidence: 'high' | 'medium' | 'low';
  story?: string;
  names: NameEntry[];
  journeys: string[];
  region: number | null;
  /** Number of city eras or landmark studies in depictions/<kind>/<id>.json. */
  pictures?: number;
}

export type Body = 'orbit' | 'moon' | 'moon-orbit';

/** How a leg was travelled. */
export type Mode = 'sea' | 'land' | 'river' | 'direct';

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
  by?: Mode;
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
  /** How each leg into a (non-waypoint) stop was travelled, as routed; "mixed" when its waypoints change mode. */
  modes: (Mode | 'mixed' | null)[];
  /** Number of scene pictures in depictions/journey/<id>.json. */
  pictures?: number;
  /** Fractional year of each (non-waypoint) stop: the clock every journey shares. */
  t: number[];
  crossings: Crossing[];
  /** A party sent out from a larger journey (Gan Ying from Ban Chao's), and the parent's stop it set out from. */
  parent?: string;
  fork?: string;
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
  /** Number of standalone sketches in depictions/invention/<id>.json. */
  pictures?: number;
  year: number | [number, number];
  /** Midpoint of `year`, for placing on the timeline. */
  mid: number;
  name: string;
  native?: string;
  place: string;
  /** The city it was made in, when there is one (the printing press in Mainz). */
  city?: string;
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

export type LivingKind = 'plant' | 'animal';

/** A place a plant or animal reached, or where a viewpoint first met it. */
export interface Arrival {
  year: number | [number, number];
  mid: number;
  place: string;
  lat: number;
  lon: number;
  /** The viewpoint that came to know it here; none for a place it simply spread to (maize on the Gold Coast). */
  vp?: VpId;
  /** Where it came from: an earlier arrival's index, or -1 for its origin. */
  src: number;
  /** The journey that carried it, when there is one. */
  via?: string;
  note: string;
  source?: string;
  confidence?: string;
}

/** A plant or animal, and how knowledge of it spread (data/living.json). */
export interface Living {
  id: string;
  kind: LivingKind;
  name: string;
  native?: string;
  origin: {year: number | [number, number]; mid: number; place: string; lat: number; lon: number; culture?: string};
  /** Viewpoints that knew it from the start. */
  home?: VpId[];
  extinct?: {year: number; note: string};
  summary: string;
  source: string;
  confidence: string;
  spread: Arrival[];
  /** The year each viewpoint came to know it. */
  known: Record<VpId, number>;
}

export interface SearchEntry {
  t: 'region' | 'city' | 'journey' | 'invention' | 'living';
  id: string;
  label: string;
  alt: string[];
}

export const LEVEL_NAMES = ['Unknown', 'Rumor', 'Contact', 'Coast charted', 'Interior mapped', 'Surveyed'];
export const HUMANITY_LEVEL_NAMES = ['No one yet', 'No one yet', 'Reached by machine', 'Reached', 'Visited and lived in', 'Inhabited'];
export const CONFIDENCE_NAMES = ['high', 'medium', 'low'];
