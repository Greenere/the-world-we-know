import type {
  Beyond,
  City,
  DepictionDoc,
  DepictionKind,
  FogDoc,
  GridDoc,
  Invention,
  Journey,
  NameEntry,
  Region,
  SearchEntry,
  Series,
  Source,
  Viewpoint,
  VpId,
  Phase,
} from './types';
import type {FogField} from './fog/field';
import type {ZhContent} from './i18n';
import {ALL_VPS} from './types';

export interface AppData {
  version: string;
  viewpoints: Viewpoint[];
  vp: Record<VpId, Viewpoint>;
  regions: Region[];
  regionById: Map<string, Region>;
  regionIndex: Map<string, number>;
  cities: City[];
  cityById: Map<string, City>;
  journeys: Journey[];
  journeyById: Map<string, Journey>;
  series: Series[];
  inventions: Invention[];
  inventionById: Map<string, Invention>;
  sources: Record<string, Source>;
  search: SearchEntry[];
  grid: GridDoc;
  fog: Record<VpId, FogDoc>;
  beyond: Beyond;
}

const BASE = `${import.meta.env.BASE_URL}data/`;

async function get<T>(path: string, version: string): Promise<T> {
  const res = await fetch(`${BASE}${path}?v=${version}`);
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status}). Run "npm run data" first.`);
  return res.json() as Promise<T>;
}

export function dataUrl(path: string): string {
  return `${BASE}${path}`;
}

export async function loadData(): Promise<AppData> {
  const manifest = await get<{version: string}>('manifest.json', String(Date.now()));
  const v = manifest.version;
  const [viewpoints, regions, cities, journeys, series, inventions, sources, search, grid, beyond, ...fogs] = await Promise.all([
    get<Viewpoint[]>('viewpoints.json', v),
    get<Region[]>('regions.json', v),
    get<City[]>('cities.json', v),
    get<Journey[]>('journeys.json', v),
    get<Series[]>('series.json', v),
    get<Invention[]>('inventions.json', v),
    get<Record<string, Source>>('sources.json', v),
    get<SearchEntry[]>('search.json', v),
    get<GridDoc>('grid.json', v),
    get<Beyond>('beyond.json', v),
    ...ALL_VPS.map(id => get<FogDoc>(`fog/${id}.json`, v)),
  ]);
  const fog = Object.fromEntries(fogs.map(f => [f.vp, f])) as Record<VpId, FogDoc>;
  return {
    version: v,
    viewpoints,
    vp: Object.fromEntries(viewpoints.map(x => [x.id, x])) as Record<VpId, Viewpoint>,
    regions,
    regionById: new Map(regions.map(r => [r.id, r])),
    regionIndex: new Map(regions.map((r, i) => [r.id, i])),
    cities,
    cityById: new Map(cities.map(c => [c.id, c])),
    journeys,
    journeyById: new Map(journeys.map(j => [j.id, j])),
    series,
    inventions,
    inventionById: new Map(inventions.map(x => [x.id, x])),
    sources,
    search,
    grid,
    fog,
    beyond,
  };
}

let zhDoc: Promise<ZhContent | null> | null = null;

/** The Chinese text for the data (names, journeys, inventions…), fetched the first time it is needed. */
export function loadZh(data: AppData): Promise<ZhContent | null> {
  zhDoc ??= get<ZhContent>('i18n/zh.json', data.version).catch(err => {
    console.warn(err);
    zhDoc = null;
    return null;
  });
  return zhDoc;
}

const pictureDocs = new Map<string, Promise<DepictionDoc | null>>();

/** The era pictures for one subject, fetched once and shared. */
export function loadPictures(data: AppData, kind: DepictionKind, id: string): Promise<DepictionDoc | null> {
  const key = `${kind}/${id}`;
  let p = pictureDocs.get(key);
  if (!p) {
    p = get<DepictionDoc>(`depictions/${key}.json`, data.version).catch(err => {
      console.warn(err);
      pictureDocs.delete(key);
      return null;
    });
    pictureDocs.set(key, p);
  }
  return p;
}

export function decodeBase64(text: string): Uint8Array {
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** The knowledge community a viewpoint belonged to in a year, whose names it shared (Rome in 1300 → Europe). */
export function communityOf(data: AppData, vp: VpId, year: number): VpId | undefined {
  return data.viewpoints.find(c => c.community?.members.some(m => m.viewpoint === vp && year >= m.from && (m.until === undefined || year < m.until)))?.id;
}

/** The name a viewpoint used for a place in a given year; then its community's (`shared`); then the default (*) name. */
export function nameFor(names: NameEntry[], vp: VpId, year: number, fallback = '', shared?: VpId): NameEntry | null {
  const fits = (n: NameEntry) => (n.from === undefined || year >= n.from) && (n.to === undefined || year <= n.to);
  const own = names.find(n => n.vp === vp && fits(n)) ?? (shared ? names.find(n => n.vp === shared && fits(n)) : undefined);
  if (own) return own;
  const def = names.find(n => n.vp === '*' && fits(n));
  if (def) return def;
  const any = names.find(n => n.vp === '*');
  return any ?? (fallback ? {vp: '*', name: fallback} : null);
}

/** Only a viewpoint's own historical name (no default), for map labels. */
export function historicalName(names: NameEntry[], vp: VpId, year: number, shared?: VpId): NameEntry | null {
  const fits = (n: NameEntry) => (n.from === undefined || year >= n.from) && (n.to === undefined || year <= n.to);
  return names.find(n => n.vp === vp && fits(n)) ?? (shared ? names.find(n => n.vp === shared && fits(n)) : undefined) ?? null;
}

export function homeAt(vp: Viewpoint, year: number) {
  let home = vp.homes[0];
  for (const h of vp.homes) if (h.from <= year) home = h;
  return home;
}

export function shortCitation(sources: Record<string, Source>, id: string): string {
  const c = sources[id]?.citation ?? id;
  const cut = c.search(/[,(]/);
  return cut > 0 ? c.slice(0, cut).trim() : c;
}

/** When a viewpoint came to know a landmark. Knowing a region is not knowing what is in it: people living near
 * it, or who knew its land closely (interior mapped or better), knew it; those with mere contact heard of it no
 * sooner than it became known beyond its neighbours (`widely`); a recorded encounter (`found`) overrides all.
 * Never before it was built, and for one lost before the viewpoint knew it, only once it was found again.
 * Every viewpoint knows every landmark in the end: we can only speak of them because the world came to. */
export function landmarkKnown(data: AppData, field: FogField, c: City, vp: VpId): number {
  let known: number | null;
  // A lost city became known beyond its neighbours when it was found again.
  const widely = c.widely ?? (c.dates.rediscovered === undefined ? undefined : mid(c.dates.rediscovered));
  const own = c.found?.[vp];
  if (vp === 'humanity') known = field.firstKnown(vp, c.cell, 3);
  else if (own !== undefined) known = own;
  else {
    // Interior knowledge counts only from a viewpoint's own mapping: the world map everyone shares from 1900
    // (knowledge.csv, world-land) is not knowing every waterfall on it.
    const own4 = field.firstKnown(vp, c.cell, 4);
    const mapped = own4 !== null && own4 < SHARED_MAP ? own4 : null;
    const near = nearHome(data, vp, c.lat, c.lon);
    const close = mapped === null ? near : near === null ? mapped : Math.min(mapped, near);
    const contact = field.firstKnown(vp, c.cell, 2);
    const far = contact === null || widely === undefined ? null : Math.max(contact, widely);
    known = close === null ? far : far === null ? close : Math.min(close, far);
  }
  // Out of reach until the world shared one map, and no sooner than it became known beyond its neighbours.
  if (known === null) known = Math.max(SHARED_MAP, widely ?? SHARED_MAP);
  if (c.kind === 'built' && c.dates.founded !== undefined) known = Math.max(known, mid(c.dates.founded));
  const lost = c.dates.forgotten;
  const found = c.dates.rediscovered;
  if (lost === undefined || found === undefined || known < mid(lost)) return known;
  return Math.max(known, mid(found));
}

/** The year of the one shared world map (knowledge.csv: *,world-land,1900). */
const SHARED_MAP = 1900;

/** Within this distance of a viewpoint's home, a landmark is its own: Stonehenge for Britain, Fuji for Japan. */
const NEAR_KM = 1000;

/** The first year a viewpoint (or, for a knowledge community, one of its members) had a home near a place. */
function nearHome(data: AppData, vp: VpId, lat: number, lon: number): number | null {
  const homes = [
    ...data.vp[vp].homes.map(h => ({h, from: h.from})),
    ...(data.vp[vp].community?.members ?? []).flatMap(m => data.vp[m.viewpoint].homes.map(h => ({h, from: Math.max(h.from, m.from)}))),
  ];
  let first: number | null = null;
  for (const {h, from} of homes) if (km(h.lat, h.lon, lat, lon) < NEAR_KM && (first === null || from < first)) first = from;
  return first;
}

function km(lat1: number, lon1: number, lat2: number, lon2: number) {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

function mid(d: number | [number, number]) {
  return typeof d === 'number' ? d : (d[0] + d[1]) / 2;
}

/** The age a phased landmark is in (the Great Wall under the Yuan), or null before its first. */
export function phaseAt(c: City, year: number): Phase | null {
  let cur: Phase | null = null;
  for (const p of c.path?.phases ?? []) if (p.from <= year) cur = p;
  return cur;
}
