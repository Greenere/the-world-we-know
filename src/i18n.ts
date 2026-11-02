// Language: English (the source) or Chinese. Interface text is keyed by its English; data text comes from
// public/data/i18n/zh.json, written by the build from data/i18n/zh/. Anything untranslated stays English.

import {zhUi} from './i18n-zh';

export type Lang = 'en' | 'zh';
export const LANGS: Lang[] = ['en', 'zh'];

/** The Chinese data bundle (see scripts/build_data.py, load_translations). */
export interface ZhContent {
  series: Record<string, string>;
  names: Record<string, string>;
  regions: Record<string, string>;
  journeys: Record<string, {name?: string; traveler?: string; years?: string; summary?: string; stops?: Record<string, {place?: string; note?: string; date?: string}>}>;
  inventions: Record<string, {name?: string; place?: string; culture?: string; summary?: string; changed?: string}>;
  living: Record<string, {name?: string; place?: string; culture?: string; summary?: string; extinct?: string; spread?: Record<string, {place?: string; note?: string}>}>;
  viewpoints: Record<string, {name?: string; longName?: string; adjective?: string; tagline?: string; startNote?: string}>;
  moments: Record<string, string>;
  depictions: Record<string, Record<string, {title?: string; caption?: string; captions?: Record<string, string>; place?: string}>>;
  stories: Record<string, string>;
  /** Keyed "landmark/phase". */
  phases: Record<string, {name?: string; note?: string}>;
  notes: Record<string, string>;
  books: Record<string, {author?: string; title?: string}>;
  /** Every character used, for the map's label font atlas. */
  chars: string;
}

let lang: Lang = 'en';
let zh: ZhContent | null = null;

export const getLang = () => lang;
export const isZh = () => lang === 'zh';

export function setLang(l: Lang, content?: ZhContent | null) {
  lang = l;
  if (content) zh = content;
  document.documentElement.lang = l === 'zh' ? 'zh-Hans' : 'en';
  document.documentElement.classList.toggle('lang-zh', l === 'zh');
  document.title = t('The World We Know');
}

/** The language to start in: the link, then the reader's last choice, then the browser. */
export function initialLang(): Lang {
  const q = new URLSearchParams(location.search).get('lang');
  if (q === 'zh' || q === 'en') return q;
  try {
    const saved = localStorage.getItem('lang');
    if (saved === 'zh' || saved === 'en') return saved;
  } catch {
    /* storage may be unavailable */
  }
  return navigator.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function rememberLang(l: Lang) {
  try {
    localStorage.setItem('lang', l);
  } catch {
    /* storage may be unavailable */
  }
}

const missing = new Set<string>();

/** Interface text. `en` is both the English and the key; {name} placeholders are filled from `vars`. */
export function t(en: string, vars?: Record<string, string | number>): string {
  let s = en;
  if (lang === 'zh') {
    const z = zhUi[en];
    if (z !== undefined) s = z;
    else if (import.meta.env.DEV && !missing.has(en)) {
      missing.add(en);
      console.debug('[i18n] no Chinese for', JSON.stringify(en));
    }
  }
  return vars ? s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? '')) : s;
}

/** Data text: the Chinese for a piece of content, or the English when there is none. */
export const tx = {
  /** A place or person's name (city names, what a viewpoint called something, stop places). */
  name(en: string): string {
    return (lang === 'zh' && zh?.names[en]) || en;
  },
  region(id: string, en: string): string {
    return (lang === 'zh' && zh?.regions[id]) || en;
  },
  journey(id: string, field: 'name' | 'traveler' | 'years' | 'summary', en: string): string {
    return (lang === 'zh' && zh?.journeys[id]?.[field]) || en;
  },
  /** `index` counts the journey's stops, skipping waypoints. */
  stop(id: string, index: number, field: 'place' | 'note' | 'date', en: string): string {
    const z = lang === 'zh' ? zh?.journeys[id]?.stops?.[index]?.[field] : undefined;
    if (z) return z;
    return field === 'place' ? tx.name(en) : en;
  },
  invention(id: string, field: 'name' | 'place' | 'culture' | 'summary' | 'changed', en: string): string {
    return (lang === 'zh' && zh?.inventions[id]?.[field]) || en;
  },
  /** A plant or animal: its name, its origin's place and culture, its story, or how it died out. */
  living(id: string, field: 'name' | 'place' | 'culture' | 'summary' | 'extinct', en: string): string {
    return (lang === 'zh' && zh?.living?.[id]?.[field]) || en;
  },
  arrival(id: string, index: number, field: 'place' | 'note', en: string): string {
    const z = lang === 'zh' ? zh?.living?.[id]?.spread?.[index]?.[field] : undefined;
    if (z) return z;
    return field === 'place' ? tx.name(en) : en;
  },
  viewpoint(id: string, field: 'name' | 'longName' | 'adjective' | 'tagline' | 'startNote', en: string): string {
    return (lang === 'zh' && zh?.viewpoints[id]?.[field]) || en;
  },
  series(id: string, en: string): string {
    return (lang === 'zh' && zh?.series?.[id]) || en;
  },
  moment(en: string): string {
    return (lang === 'zh' && zh?.moments[en]) || en;
  },
  depiction(subject: string, item: string, field: 'title' | 'caption' | 'place', en: string, vp?: string): string {
    if (lang !== 'zh') return en;
    const d = zh?.depictions[subject]?.[item];
    return (vp && d?.captions?.[vp]) || d?.[field] || en;
  },
  story(cityId: string, en: string): string {
    return (lang === 'zh' && zh?.stories[cityId]) || en;
  },
  /** A knowledge event's note. */
  phase(landmark: string, phase: string, field: 'name' | 'note', en: string): string {
    return (lang === 'zh' && zh?.phases?.[`${landmark}/${phase}`]?.[field]) || en;
  },
  note(en: string): string {
    return (lang === 'zh' && zh?.notes[en]) || en;
  },
  book(id: string, field: 'author' | 'title', en: string): string {
    return (lang === 'zh' && zh?.books?.[id]?.[field]) || en;
  },
  chars(): string {
    return zh?.chars ?? '';
  },
};
