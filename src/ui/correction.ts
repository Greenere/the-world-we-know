import type {AppData} from '../data';
import type {State} from '../state';
import {getLang, t} from '../i18n';
import {CONFIDENCE_NAMES, HUMANITY_LEVEL_NAMES, LEVEL_NAMES} from '../types';
import type {VpId} from '../types';
import {h} from './dom';

export const REPO_URL = 'https://github.com/Greenere/the-world-we-know';

/** What a card shows, as a correction needs to name it: its kind and id, its English name, and what the card
 * says at the moment of the click (in English, whatever the reader's language: it is for whoever keeps the data). */
export interface Subject {
  kind: 'region' | 'place' | 'journey' | 'invention' | 'book' | 'plant or animal';
  id: string;
  name: string;
  context?: (s: State) => string[];
}

/** Years as the data writes them, readable: 430 BCE, 1450, 1000–1100. */
export function plainYear(y: number | [number, number]): string {
  const one = (n: number) => (Math.round(n) < 0 ? `${-Math.round(n)} BCE` : String(Math.round(n)));
  return typeof y === 'number' ? one(y) : `${one(y[0])}–${one(y[1])}`;
}

/** A level as the atlas names it, in English. */
export function plainLevel(vp: VpId | '*', level: number): string {
  return `${level} ${(vp === 'humanity' ? HUMANITY_LEVEL_NAMES : LEVEL_NAMES)[level] ?? ''}`.trim();
}

export const plainConfidence = (conf: number) => CONFIDENCE_NAMES[conf] ?? String(conf);

// GitHub caps the length of an address it will open; the context gives way first.
const MAX_CONTEXT = 4000;

/** "Suggest a correction": a new issue on the repository, its form filled with what the card shows, through
 * whose eyes and when, the rows behind it, and a link back to this very view. Built when clicked, so it
 * carries the year and the card's state then. */
export function correctionLink(data: AppData, subject: Subject, state: () => State): HTMLElement {
  const a = h('a.card-fix', {target: '_blank', rel: 'noopener'}, t('Suggest a correction')) as HTMLAnchorElement;
  const build = () => {
    const s = state();
    const vps = s.vps.map(v => data.vp[v].name).join(' and ');
    let context = [
      ...(subject.context?.(s) ?? []),
      '',
      `Data version ${data.version} · interface in ${getLang() === 'zh' ? 'Chinese' : 'English'}${s.compare ? ' · comparing two viewpoints' : ''}`,
    ].join('\n');
    if (context.length > MAX_CONTEXT) context = `${context.slice(0, MAX_CONTEXT)}\n…`;
    const q = new URLSearchParams({
      template: 'correction.yml',
      title: `Correction: ${subject.name}`,
      subject: `${subject.kind}: ${subject.name} (${subject.id})`,
      view: `${vps}, ${plainYear(s.year)}`,
      link: location.href,
      context,
    });
    a.href = `${REPO_URL}/issues/new?${q.toString().replace(/\+/g, '%20')}`;
  };
  // Ready for a hover's status line or a middle click, and current again at the click itself.
  a.addEventListener('pointerenter', build);
  a.addEventListener('focus', build);
  a.addEventListener('click', build);
  build();
  return a;
}
