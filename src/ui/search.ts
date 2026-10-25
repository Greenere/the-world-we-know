import type {AppData} from '../data';
import type {State, Store} from '../state';
import type {SearchEntry} from '../types';
import {h} from './dom';
import {icons, inventionIcons, kindIcons} from './icons';
import {formatRange} from '../time';

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯʻʼ’'ʻ]/g, '')
    .toLowerCase();

interface Indexed {
  entry: SearchEntry;
  keys: string[];
}

/** "/" opens it: places, cities, journeys, inventions and every name any viewpoint used. */
export class Search {
  el: HTMLElement;
  private input: HTMLInputElement;
  private results: HTMLElement;
  private index: Indexed[];
  private items: {entry: SearchEntry; el: HTMLElement}[] = [];
  private active = 0;

  constructor(
    private data: AppData,
    private store: Store,
    private choose: (e: SearchEntry) => void,
  ) {
    this.index = data.search.map(entry => ({entry, keys: [entry.label, ...entry.alt].filter(Boolean).map(fold)}));
    this.input = h('input.search-input', {
      type: 'search',
      placeholder: 'A place, a city, a traveller, an invention, or what someone called it…',
      'aria-label': 'Search',
      autocomplete: 'off',
      spellcheck: 'false',
    });
    this.results = h('ul.search-results', {role: 'listbox'});
    this.el = h(
      'div.search-overlay',
      {onclick: (e: Event) => e.target === this.el && store.set({search: false})},
      h('div.search.panel', h('div.search-row', h('span.search-icon', {html: icons.search}), this.input, h('kbd', 'esc')), this.results),
    );
    this.el.hidden = true;
    this.input.addEventListener('input', () => this.run());
    this.input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        this.move(e.key === 'ArrowDown' ? 1 : -1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const it = this.items[this.active];
        if (it) this.pick(it.entry);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        store.set({search: false});
      }
    });
  }

  update(s: State) {
    const show = s.search;
    if (show === !this.el.hidden) return;
    this.el.hidden = !show;
    if (show) {
      this.input.value = '';
      this.run();
      requestAnimationFrame(() => this.input.focus());
    }
  }

  private pick(e: SearchEntry) {
    this.store.set({search: false});
    this.choose(e);
  }

  private move(d: number) {
    if (!this.items.length) return;
    this.active = (this.active + d + this.items.length) % this.items.length;
    this.items.forEach((it, i) => it.el.classList.toggle('active', i === this.active));
    this.items[this.active].el.scrollIntoView({block: 'nearest'});
  }

  private run() {
    const q = fold(this.input.value.trim());
    let hits: {entry: SearchEntry; score: number; via?: string}[] = [];
    if (!q) {
      hits = this.data.journeys.map(j => ({entry: this.index.find(x => x.entry.t === 'journey' && x.entry.id === j.id)!.entry, score: 0}));
    } else {
      for (const {entry, keys} of this.index) {
        let best = Infinity;
        let via: string | undefined;
        keys.forEach((k, i) => {
          const pos = k.indexOf(q);
          if (pos < 0) return;
          const word = pos === 0 || /[\s(,-]/.test(k[pos - 1]);
          const score = (pos === 0 ? 0 : word ? 1 : 3) + (i === 0 ? 0 : 0.5) + k.length / 100;
          if (score < best) {
            best = score;
            via = i === 0 ? undefined : [entry.label, ...entry.alt].filter(Boolean)[i];
          }
        });
        if (best < Infinity) hits.push({entry, score: best + (entry.t === 'journey' ? -0.2 : entry.t === 'city' ? 0 : 0.1), via});
      }
      hits.sort((a, b) => a.score - b.score);
    }
    this.items = [];
    this.active = 0;
    this.results.replaceChildren(
      ...hits.slice(0, 30).map((hit, i) => {
        const {entry} = hit;
        const j = entry.t === 'journey' ? this.data.journeyById.get(entry.id) : null;
        const inv = entry.t === 'invention' ? this.data.inventionById.get(entry.id) : null;
        const icon = j ? kindIcons[j.kind] ?? '' : inv ? inventionIcons[inv.category] ?? icons.invention : entry.t === 'city' ? '<svg viewBox="0 0 20 20" width="20" height="20"><circle cx="10" cy="10" r="3.4" fill="currentColor"/><circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>' : '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M4 6.5l4-2 4 2 4-2v9l-4 2-4-2-4 2z"/><path d="M8 4.5v9M12 6.5v9"/></svg>';
        const meta =
          entry.t === 'journey'
            ? `Journey · ${entry.alt.filter(Boolean).join(' · ')}`
            : inv
              ? `Invention · ${formatRange(inv.year)} · ${inv.place}`
              : entry.t === 'city'
                ? 'City'
                : 'Region';
        const el = h(
          'li.search-item',
          {role: 'option', onclick: () => this.pick(entry), onmousemove: () => this.setActive(i)},
          h('span.search-item-icon', {html: icon}),
          h('span.search-item-text', h('span.search-item-label', entry.label), h('span.search-item-meta', hit.via ? `${meta} · also “${hit.via}”` : meta)),
        );
        if (i === 0) el.classList.add('active');
        this.items.push({entry, el});
        return el;
      }),
    );
    if (q && !hits.length) this.results.append(h('li.search-empty', 'Nothing by that name in this atlas yet.'));
  }

  private setActive(i: number) {
    if (i === this.active) return;
    this.active = i;
    this.items.forEach((it, k) => it.el.classList.toggle('active', k === i));
  }
}
