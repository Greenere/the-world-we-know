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
} from './types';
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

/** The name a viewpoint used for a place in a given year; falls back to the default (*) name. */
export function nameFor(names: NameEntry[], vp: VpId, year: number, fallback = ''): NameEntry | null {
  const fits = (n: NameEntry) => (n.from === undefined || year >= n.from) && (n.to === undefined || year <= n.to);
  const own = names.find(n => n.vp === vp && fits(n));
  if (own) return own;
  const def = names.find(n => n.vp === '*' && fits(n));
  if (def) return def;
  const any = names.find(n => n.vp === '*');
  return any ?? (fallback ? {vp: '*', name: fallback} : null);
}

/** Only a viewpoint's own historical name (no default), for map labels. */
export function historicalName(names: NameEntry[], vp: VpId, year: number): NameEntry | null {
  return (
    names.find(n => n.vp === vp && (n.from === undefined || year >= n.from) && (n.to === undefined || year <= n.to)) ??
    null
  );
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
