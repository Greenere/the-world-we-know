import type {AppData} from '../data';
import {loadPictures, shortCitation} from '../data';
import type {JourneyGeo} from '../journey-geo';
import {currentStopIndex} from '../journey-geo';
import type {State, Store} from '../state';
import {formatRange, formatYear, mainScale} from '../time';
import type {Journey, VpId} from '../types';
import {MAIN_VPS} from '../types';
import {t, tx} from '../i18n';
import {h, setIcon} from './dom';
import {icons, inventionIcons, kindIcons} from './icons';

/** Journey kinds grouped into the list's filters. */
const FILTERS: {id: string; label: string; kinds: string[]}[] = [
  {id: 'all', label: 'All', kinds: []},
  {id: 'sea', label: 'By sea', kinds: ['sailor', 'fleet', 'merchant route', 'group voyage']},
  {id: 'land', label: 'Overland', kinds: ['traveler', 'pilgrim', 'envoy', 'merchant']},
  {id: 'military', label: 'Military', kinds: ['military']},
  {id: 'science', label: 'Science', kinds: ['scientific']},
  {id: 'frontier', label: 'Frontiers', kinds: ['polar', 'mountaineering', 'deep dive', 'spaceflight']},
];

/** Left panel: the list of journeys and inventions, or the journey being followed. */
export class JourneyPanel {
  el: HTMLElement;
  private body: HTMLElement;
  private key = '';
  private stopEls: HTMLElement[] = [];
  private counter: HTMLElement | null = null;
  private playBtn: HTMLButtonElement | null = null;
  private viewBtns: {follow: HTMLButtonElement; route: HTMLButtonElement} | null = null;
  private epilogueEl: HTMLElement | null = null;
  private tab: 'journeys' | 'inventions' = 'journeys';
  private filter = 'all';
  /** Viewpoint filter: null for all journeys (where the list always opens). */
  private vpFilter: VpId | null = null;
  private query = '';
  private view: 'list' | 'timeline' = 'list';
  private openEras = new Set<string>();
  private resultsEl: HTMLElement | null = null;
  private haystack = new Map<string, string>();
  private listEl: HTMLElement | null = null;
  private meanwhileEl: HTMLElement | null = null;
  private meanwhileKey = '';
  private invItems = new Map<string, HTMLElement>();

  constructor(
    private data: AppData,
    private store: Store,
    private actions: {
      start(id: string): void;
      step(dir: -1 | 1): void;
      close(): void;
      openRegion(id: string): void;
      openInvention(id: string): void;
      switchTo(id: string, year: number): void;
      showSketch(stop: number): void;
      jumpTo(year: number): void;
      recenter(): void;
    },
  ) {
    this.body = h('div.jp-body');
    this.el = h('aside.journey-panel.panel', this.body);
    this.el.hidden = true;
  }

  update(s: State, geo: JourneyGeo | null) {
    const mode = geo ? `j:${geo.journey.id}` : s.panel === 'journeys' ? 'list' : 'none';
    this.el.hidden = mode === 'none';
    if (mode !== this.key) {
      this.key = mode;
      this.body.replaceChildren();
      this.stopEls = [];
      this.meanwhileEl = null;
      this.meanwhileKey = '';
      if (geo) this.body.append(...(this.journey(geo).filter(Boolean) as Node[]));
      else if (mode === 'list') this.body.append(...this.list());
      this.el.scrollTop = 0;
    }
    if (geo) this.progress(s, geo);
    for (const [id, el] of this.invItems) el.classList.toggle('current', id === s.invention);
  }

  private list(): Node[] {
    const tab = (id: 'journeys' | 'inventions', label: string) =>
      h(
        'button.jp-tab',
        {
          type: 'button',
          role: 'tab',
          'aria-selected': String(this.tab === id),
          class: this.tab === id ? 'active' : '',
          onclick: () => {
            if (this.tab === id) return;
            this.tab = id;
            this.key = '';
            this.update(this.store.state, null);
          },
        },
        t(label),
      );
    this.listEl = h('div.jp-list-body');
    this.invItems.clear();
    if (this.tab === 'journeys') this.listEl.append(...this.journeyList());
    else this.listEl.append(...this.inventionList());
    return [
      h(
        'div.jp-head',
        h('div.jp-tabs', {role: 'tablist'}, tab('journeys', 'Journeys'), tab('inventions', 'Inventions')),
        h('button.card-close', {type: 'button', 'aria-label': t('Close'), onclick: () => this.store.set({panel: 'none'}), html: icons.close}),
      ),
      this.listEl,
    ];
  }

  // ── The journeys list: search, filters, series, and a list or timeline view ──

  /** Journeys as list entries: a series of voyages is one entry. */
  private entries(): Entry[] {
    const inSeries = new Map<string, string>();
    for (const sr of this.data.series) for (const id of sr.journeys) inSeries.set(id, sr.id);
    const out: Entry[] = [];
    for (const sr of this.data.series) {
      const members = sr.journeys.map(id => this.data.journeyById.get(id)).filter(Boolean) as Journey[];
      if (members.length) out.push(entryOf(sr.id, tx.series(sr.id, sr.name), members));
    }
    for (const j of this.data.journeys) if (!inSeries.has(j.id)) out.push(entryOf(j.id, tx.journey(j.id, 'name', j.name), [j]));
    return out.sort((a, b) => a.t0 - b.t0);
  }

  /** Everything a search can match for a journey: its name, traveller, years and every stop, in both languages. */
  private searchText(j: Journey): string {
    let s = this.haystack.get(j.id);
    if (s === undefined) {
      const real = j.stops.filter(x => !x.waypoint);
      s = fold(
        [j.name, tx.journey(j.id, 'name', j.name), j.traveler ?? '', tx.journey(j.id, 'traveler', j.traveler ?? ''), j.years,
         ...real.flatMap((x, i) => [x.place ?? '', tx.stop(j.id, i, 'place', x.place ?? '')])].join(' | '),
      );
      this.haystack.set(j.id, s);
    }
    return s;
  }

  /** Which of an entry's journeys pass the filters and the search (empty: the entry is hidden). */
  private matching(e: Entry): Journey[] {
    const f = FILTERS.find(x => x.id === this.filter) ?? FILTERS[0];
    const q = fold(this.query.trim());
    return e.members.filter(
      j => (f.id === 'all' || f.kinds.includes(j.kind)) && (!this.vpFilter || j.viewpoint === this.vpFilter) && (!q || this.searchText(j).includes(q)),
    );
  }

  private journeyList(): Node[] {
    const all = this.data.journeys;
    const chips = (cls: string, label: string, items: {id: string | null; label: string; n: number; color?: string}[], current: string | null, set: (id: string | null) => void) =>
      h(
        `div.jp-filters.${cls}`,
        {role: 'group', 'aria-label': label},
        items
          .filter(x => x.n)
          .map(x =>
            h(
              'button.jp-filter',
              {
                type: 'button',
                'aria-pressed': String(x.id === current),
                class: x.id === current ? 'active' : '',
                style: x.color ? `--chip:${x.color}` : '',
                onclick: (e: Event) => {
                  set(x.id);
                  const group = (e.currentTarget as HTMLElement).parentElement!;
                  for (const b of group.children) {
                    b.classList.toggle('active', b === e.currentTarget);
                    b.setAttribute('aria-pressed', String(b === e.currentTarget));
                  }
                  this.renderResults();
                },
              },
              x.color ? h('span.jp-filter-dot') : null,
              x.label,
              h('span.jp-filter-n', String(x.n)),
            ),
          ),
      );
    const vpChips = chips(
      'jp-vps',
      t('Viewpoint'),
      [{id: null, label: t('All'), n: all.length}, ...MAIN_VPS.map(v => ({id: v, label: tx.viewpoint(v, 'name', this.data.vp[v].name), n: all.filter(j => j.viewpoint === v).length, color: this.data.vp[v].color}))],
      this.vpFilter,
      id => (this.vpFilter = id as VpId | null),
    );
    const kindChips = chips(
      'jp-kinds',
      t('Kind of journey'),
      FILTERS.map(x => ({id: x.id, label: t(x.label), n: x.id === 'all' ? all.length : all.filter(j => x.kinds.includes(j.kind)).length})),
      this.filter,
      id => (this.filter = id ?? 'all'),
    );
    const search = h('input.jp-search', {
      type: 'search',
      placeholder: t('Find a journey, a traveller or a place…'),
      'aria-label': t('Find a journey'),
      value: this.query,
      autocomplete: 'off',
      spellcheck: 'false',
    });
    search.addEventListener('input', () => {
      this.query = search.value;
      this.renderResults();
    });
    search.addEventListener('keydown', e => e.stopPropagation());
    const viewBtn = (v: 'list' | 'timeline', label: string, icon: string) =>
      h(
        'button.jp-view-btn',
        {
          type: 'button',
          class: this.view === v ? 'active' : '',
          'aria-pressed': String(this.view === v),
          onclick: (e: Event) => {
            this.view = v;
            for (const b of (e.currentTarget as HTMLElement).parentElement!.children) b.classList.toggle('active', b === e.currentTarget);
            this.renderResults();
          },
        },
        h('span', {html: icon}),
        h('span.jp-view-label', t(label)),
      );
    this.resultsEl = h('div.jp-results');
    this.renderResults();
    return [
      h('div.jp-tools', h('div.jp-search-row', h('span.jp-search-icon', {html: icons.search}), search), h('div.jp-view.jp-list-view', {role: 'group'}, viewBtn('list', 'List', icons.list), viewBtn('timeline', 'Timeline', icons.timeline))),
      vpChips,
      kindChips,
      this.resultsEl,
    ];
  }

  private renderResults() {
    const el = this.resultsEl;
    if (!el) return;
    const entries = this.entries()
      .map(e => ({e, hits: this.matching(e)}))
      .filter(x => x.hits.length);
    if (!entries.length) {
      el.replaceChildren(h('p.jp-empty', t('No journey matches.')));
      return;
    }
    const timeline = this.view === 'timeline' && innerWidth >= 760;
    el.replaceChildren(...(timeline ? [this.timelineView(entries)] : this.listView(entries)));
  }

  private listView(entries: {e: Entry; hits: Journey[]}[]): Node[] {
    const searching = !!this.query.trim();
    const total = entries.reduce((n, x) => n + x.hits.length, 0);
    const openAll = searching || total <= 12;
    const out: Node[] = [];
    const year = this.store.state.year;
    if (!searching && year >= -500) {
      // A century either side in antiquity, a generation or two in the crowded centuries since; the nearest eight.
      const span = year > 1500 ? 40 : 100;
      const near = entries
        .filter(({e}) => e.t0 <= year + span && e.t1 >= year - span)
        .sort((a, b) => Math.abs((a.e.t0 + a.e.t1) / 2 - year) - Math.abs((b.e.t0 + b.e.t1) / 2 - year))
        .slice(0, 8);
      if (near.length) {
        out.push(h('section.jp-group.jp-near', h('h3.card-h', t('Under way around {year}', {year: formatYear(year)})), h('ul.jp-list', near.map(x => this.row(x.e, x.hits)))));
      }
    }
    const eras: [string, number, number][] = [
      ['Antiquity', -Infinity, 500],
      ['500 – 1400', 500, 1400],
      ['1400 – 1800', 1400, 1800],
      ['The last frontiers', 1800, Infinity],
    ];
    for (const [title, a, b] of eras) {
      const list = entries.filter(({e}) => e.t0 >= a && e.t0 < b);
      if (!list.length) continue;
      const n = list.reduce((k, x) => k + x.hits.length, 0);
      const open = openAll || this.openEras.has(title);
      const body = h('ul.jp-list', {hidden: !open}, open ? list.map(x => this.row(x.e, x.hits)) : []);
      const head = h(
        'button.jp-era',
        {
          type: 'button',
          'aria-expanded': String(open),
          onclick: () => {
            const now = body.hidden;
            if (now && !body.childElementCount) body.append(...list.map(x => this.row(x.e, x.hits)));
            body.hidden = !now;
            head.setAttribute('aria-expanded', String(now));
            if (now) this.openEras.add(title);
            else this.openEras.delete(title);
          },
        },
        h('span.jp-era-title', t(title)),
        h('span.jp-era-n', String(n)),
        h('span.jp-era-caret', {html: icons.next}),
      );
      out.push(h('section.jp-group', head, body));
    }
    return out;
  }

  /** One row: a journey, or a series with a numbered chip for each voyage. */
  private row(e: Entry, hits: Journey[]): HTMLElement {
    const first = e.members[0];
    const color = this.data.vp[first.viewpoint].color;
    const main = h(
      'button.jp-item',
      {type: 'button', style: `--chip:${color}`, onclick: () => this.actions.start((hits[0] ?? first).id)},
      h('span.jp-item-icon', {html: kindIcons[first.kind] ?? kindIcons.traveler}),
      h(
        'span.jp-item-text',
        h('span.jp-item-name', e.name),
        h(
          'span.jp-item-meta',
          e.members.length > 1
            ? `${formatRange([Math.round(e.t0), Math.round(e.t1)]).replace(/^(c\. |约)/, '')} · ${t('{n} voyages', {n: e.members.length})}`
            : `${tx.journey(first.id, 'years', first.years)} · ${t(first.kind)}`,
        ),
      ),
    );
    if (e.members.length === 1) return h('li', main);
    const searching = !!this.query.trim();
    return h(
      'li.jp-series',
      main,
      h(
        'div.jp-series-chips',
        {style: `--chip:${color}`},
        e.members.map((j, i) =>
          h(
            'button.jp-series-chip',
            {
              type: 'button',
              class: searching && hits.includes(j) ? 'hit' : !hits.includes(j) ? 'dim' : '',
              title: `${tx.journey(j.id, 'name', j.name)} · ${tx.journey(j.id, 'years', j.years)}`,
              'aria-label': tx.journey(j.id, 'name', j.name),
              onclick: () => this.actions.start(j.id),
            },
            String(i + 1),
          ),
        ),
      ),
    );
  }

  /** Every journey as a bar on the time axis, packed into lanes, a series as linked bars. */
  private timelineView(entries: {e: Entry; hits: Journey[]}[]): Node {
    const W = Math.max(280, (this.el.clientWidth || 380) - 40);
    const X = (y: number) => 4 + mainScale.toX(y) * (W - 8);
    const lanes: number[] = [];
    const LH = 21;
    const placed = entries.map(({e, hits}) => {
      const x0 = X(e.t0);
      const x1 = Math.max(x0 + 3, X(e.t1));
      const label = e.name;
      const lw = [...label].reduce((a, ch) => a + (ch.charCodeAt(0) > 0x2e80 ? 11.5 : 5.6), 0);
      const right = x1 + 5 + lw <= W;
      const from = right ? x0 : Math.max(0, x0 - 5 - lw);
      const to = right ? x1 + 5 + lw : x1;
      let lane = lanes.findIndex(end => end + 6 <= from);
      if (lane < 0) lane = lanes.push(-Infinity) - 1;
      lanes[lane] = to;
      return {e, hits, x0, x1, lane, right, lw};
    });
    const H = lanes.length * LH + 26;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', String(W));
    svg.setAttribute('height', String(H));
    svg.setAttribute('class', 'jp-gantt');
    const parts: string[] = [];
    for (const [y, label] of [[-500, formatYear(-500)], [0, formatYear(1)], [500, '500'], [1000, '1000'], [1500, '1500'], [1800, '1800'], [1900, '1900']] as [number, string][]) {
      const x = X(y);
      parts.push(`<line x1="${x}" x2="${x}" y1="14" y2="${H}" class="g-grid"/><text x="${x}" y="10" class="g-axis" text-anchor="middle">${label}</text>`);
    }
    const now = this.store.state.year;
    if (now >= -500) parts.push(`<line x1="${X(now)}" x2="${X(now)}" y1="12" y2="${H}" class="g-now"/>`);
    svg.innerHTML = parts.join('');
    const NS = 'http://www.w3.org/2000/svg';
    const mk = (tag: string, attrs: Record<string, string | number>) => {
      const n = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
      return n;
    };
    for (const p of placed) {
      const y = 24 + p.lane * LH;
      const color = this.data.vp[p.e.members[0].viewpoint].color;
      const g = mk('g', {class: 'g-row', style: `--c:${color}`});
      if (p.e.members.length > 1) g.append(mk('line', {x1: p.x0, x2: p.x1, y1: y, y2: y, class: 'g-link'}));
      for (const j of p.e.members) {
        const a = X(j.t[0]);
        const b = Math.max(a + 3, X(j.t[j.t.length - 1]));
        const bar = mk('rect', {x: a, y: y - 3.5, width: b - a, height: 7, rx: 2, class: p.hits.includes(j) ? 'g-bar' : 'g-bar dim'});
        const title = mk('title', {});
        title.textContent = `${tx.journey(j.id, 'name', j.name)} · ${tx.journey(j.id, 'years', j.years)}`;
        bar.append(title);
        bar.addEventListener('click', () => this.actions.start(j.id));
        g.append(bar);
      }
      const text = mk('text', {x: p.right ? p.x1 + 5 : p.x0 - 5, y: y + 4, class: 'g-label', 'text-anchor': p.right ? 'start' : 'end'});
      text.textContent = p.e.name;
      text.addEventListener('click', () => this.actions.start((p.hits[0] ?? p.e.members[0]).id));
      g.append(text);
      svg.append(g);
    }
    return h('div.jp-gantt-wrap', svg);
  }

  private inventionList(): Node[] {
    const groups: [string, number, number][] = [
      ['Before paper maps', -Infinity, 500],
      ['500 – 1400', 500, 1400],
      ['1400 – 1800', 1400, 1800],
      ['Machines and satellites', 1800, Infinity],
    ];
    return [
      h('p.jp-intro', t('Instruments and ideas that let people see, reach or record more of the world. Each marks its place of origin on the map for a century.')),
      ...groups.map(([title, a, b]) => {
        const list = this.data.inventions.filter(x => x.mid >= a && x.mid < b);
        if (!list.length) return null;
        return h(
          'section.jp-group',
          h('h3.card-h', t(title)),
          h(
            'ul.jp-list',
            list.map(x => {
              const vp = x.vp ? this.data.vp[x.vp] : null;
              const btn = h(
                'button.jp-item.inv-item',
                {type: 'button', style: vp ? `--chip:${vp.color}` : '', onclick: () => this.actions.openInvention(x.id)},
                h('span.jp-item-icon', {html: inventionIcons[x.category] ?? icons.invention}),
                h('span.jp-item-text', h('span.jp-item-name', tx.invention(x.id, 'name', x.name)), h('span.jp-item-meta', `${formatRange(x.year)} · ${tx.invention(x.id, 'place', x.place)}`)),
              );
              this.invItems.set(x.id, btn);
              return h('li', btn);
            }),
          ),
        );
      }),
    ].filter(Boolean) as Node[];
  }

  private journey(geo: JourneyGeo): (Node | null)[] {
    const j = geo.journey;
    const vp = this.data.vp[j.viewpoint];
    this.counter = h('span.jp-counter');
    this.playBtn = h('button.jp-play', {type: 'button', onclick: () => this.store.set({playing: !this.store.state.playing})});
    const informed = new Map<string, {region: string; year: number}[]>();
    for (const inf of j.informs) {
      if (!j.lifts.includes(inf.region)) continue;
      const list = informed.get(inf.viewpoint) ?? [];
      list.push({region: inf.region, year: inf.homeKnowsMid});
      informed.set(inf.viewpoint, list);
    }
    const stopsList = h(
      'ol.jp-stops',
      geo.stops.map((st, i) => {
        const s = st.stop;
        const src = s.source ?? j.source;
        const li = h(
          'li.jp-stop',
          {onclick: () => this.store.set({progress: i, playing: false})},
          h('span.jp-stop-dot'),
          h(
            'div.jp-stop-text',
            h('div.jp-stop-when', s.date ? tx.stop(j.id, i, 'date', s.date) : formatYear(st.year)),
            h('div.jp-stop-place', tx.stop(j.id, i, 'place', s.place ?? '')),
            s.note ? h('p.jp-stop-note', tx.stop(j.id, i, 'note', s.note)) : null,
            h('div.jp-stop-src', {title: this.data.sources[src]?.citation ?? src}, shortCitation(this.data.sources, src), s.confidence && s.confidence !== j.confidence ? ` · ${t('{level} confidence', {level: t(s.confidence)})}` : ''),
          ),
        );
        this.stopEls.push(li);
        return li;
      }),
    );
    // Stops with a sketch get a small mark that opens it.
    if (j.pictures) {
      loadPictures(this.data, 'journey', j.id).then(doc => {
        for (const sc of doc?.scenes ?? []) {
          const li = this.stopEls[sc.stop ?? -1];
          if (!li || li.querySelector('.jp-stop-sketch')) continue;
          li.querySelector('.jp-stop-place')?.append(
            h('button.jp-stop-sketch', {
              type: 'button',
              title: t('Sketch: {title}', {title: tx.depiction(`journey/${j.id}`, sc.id, 'title', sc.title)}),
              'aria-label': t('Show the sketch: {title}', {title: tx.depiction(`journey/${j.id}`, sc.id, 'title', sc.title)}),
              html: icons.sketch,
              onclick: (e: Event) => {
                e.stopPropagation();
                this.actions.showSketch(sc.stop ?? 0);
              },
            }),
          );
        }
      });
    }
    if (geo.epilogue) {
      this.epilogueEl = h(
        'li.jp-stop.epilogue',
        {onclick: () => this.store.set({progress: geo.stops.length, playing: false})},
        h('span.jp-stop-dot'),
        h('div.jp-stop-text', h('div.jp-stop-when', formatYear(geo.homeKnows)), h('div.jp-stop-place', t('The news reaches home')), h('p.jp-stop-note', t('Only now does the fog lift.'))),
      );
      stopsList.append(this.epilogueEl);
    } else {
      this.epilogueEl = null;
    }
    return [
      h(
        'div.jp-sticky',
        h(
          'div.jp-head',
          h('div.card-kicker', {style: `color:${vp.color}`}, h('span.kicker-icon', {html: kindIcons[j.kind] ?? ''}), `${t(j.kind)} · ${tx.journey(j.id, 'years', j.years)}`),
          h('button.card-close', {type: 'button', 'aria-label': t('Close journey'), onclick: () => this.actions.close(), html: icons.close}),
        ),
        h('h2.card-title', tx.journey(j.id, 'name', j.name)),
        h(
          'div.jp-controls',
          h('button.jp-step', {type: 'button', 'aria-label': t('Previous stop'), onclick: () => this.actions.step(-1), html: icons.prev}),
          this.playBtn,
          h('button.jp-step', {type: 'button', 'aria-label': t('Next stop'), onclick: () => this.actions.step(1), html: icons.next}),
          this.counter,
          this.viewToggle(),
        ),
      ),
      j.traveler ? h('p.jp-traveller', tx.journey(j.id, 'traveler', j.traveler)) : null,
      h('p.jp-summary', tx.journey(j.id, 'summary', j.summary)),
      h(
        'div.jp-lifts',
        h('h3.card-h', t('Lifts the fog')),
        h(
          'ul',
          [...informed].map(([v, list]) => {
            const SHOW = 6;
            const item = (x: {region: string; year: number}, i: number) => [
              i ? ', ' : '',
              h('button.linkish', {type: 'button', onclick: () => this.actions.openRegion(x.region)}, tx.region(x.region, this.data.regionById.get(x.region)?.name ?? x.region)),
              h('span.jp-lift-year', ` ${formatYear(x.year)}`),
            ];
            const rest = list.length > SHOW + 1 ? h('span.jp-lift-rest', {hidden: true}, list.slice(SHOW).map((x, i) => item(x, i + SHOW))) : null;
            const more = rest
              ? h(
                  'button.linkish.jp-lift-more',
                  {
                    type: 'button',
                    onclick: (e: Event) => {
                      rest.hidden = false;
                      (e.currentTarget as HTMLElement).remove();
                    },
                  },
                  t('and {n} more', {n: list.length - SHOW}),
                )
              : null;
            return h(
              'li',
              h('span.jp-lift-vp', {style: `color:${this.data.vp[v as keyof AppData['vp']].color}`}, tx.viewpoint(v, 'name', this.data.vp[v as keyof AppData['vp']].name)),
              ' ',
              (rest ? list.slice(0, SHOW) : list).map(item),
              more ? ' ' : null,
              more,
              rest,
            );
          }),
        ),
      ),
      this.crossedPaths(j),
      (this.meanwhileEl = h('div.jp-meanwhile', {hidden: true})),
      stopsList,
    ];
  }

  /** Other journeys that came close in place and time, computed by the build. */
  private crossedPaths(j: Journey): HTMLElement | null {
    if (!j.crossings.length) return null;
    return h(
      'div.jp-crossings',
      h('h3.card-h', t('Crossed paths')),
      h(
        'ul.jp-cross-list',
        j.crossings.map(c => {
          const other = this.data.journeyById.get(c.journey);
          if (!other) return null;
          const color = this.data.vp[other.viewpoint].color;
          const otherName = tx.journey(other.id, 'name', other.name);
          const otherPlace = this.stopName(other, c.otherPlace);
          const place = this.stopName(j, c.place);
          const text =
            c.kind === 'meanwhile'
              ? [h('em', otherName), t(' was at {other}, {km} km from {place}.', {other: otherPlace, km: Math.round(c.km / 10) * 10, place})]
              : [h('em', otherName), t(c.otherT < c.t ? ' had passed through {other} in {year}.' : ' would pass through {other} in {year}.', {other: otherPlace, year: formatYear(c.otherT)})];
          return h(
            'li.jp-cross',
            {style: `--chip:${color}`},
            h(
              'button.jp-cross-main',
              {type: 'button', title: t('Go to this moment'), onclick: () => this.actions.jumpTo(c.t)},
              h('span.jp-cross-when', `${formatYear(c.t)} · ${place}`),
              h('span.jp-cross-text', text),
            ),
            h('button.jp-cross-follow', {type: 'button', title: t('Follow {name} from here', {name: otherName}), 'aria-label': t('Follow {name}', {name: otherName}), onclick: () => this.actions.switchTo(other.id, c.otherT), html: kindIcons[other.kind] ?? icons.arrow}),
          );
        }),
      ),
    );
  }

  /** A stop's place in the current language, looked up by its English name among the journey's stops. */
  private stopName(j: Journey, en: string): string {
    const i = j.stops.filter(x => !x.waypoint).findIndex(x => x.place === en);
    return i >= 0 ? tx.stop(j.id, i, 'place', en) : tx.name(en);
  }

  /** Who else is travelling right now, nearest first. Called by the app as the traveller moves. */
  setMeanwhile(others: {id: string; name: string; color: [number, number, number]; km: number; where: string}[]) {
    const el = this.meanwhileEl;
    if (!el) return;
    const key = others.map(o => `${o.id}:${o.where}:${Math.round(o.km / 100)}`).join('|');
    if (key === this.meanwhileKey) return;
    this.meanwhileKey = key;
    el.hidden = !others.length;
    if (!others.length) return;
    const year = this.store.state.year;
    el.replaceChildren(
      h('h3.card-h', t('Meanwhile')),
      h(
        'ul.jp-cross-list',
        others.map(o =>
          h(
            'li.jp-cross',
            {style: `--chip:rgb(${o.color.join(',')})`},
            h(
              'button.jp-cross-main',
              {type: 'button', title: t('Follow {name} instead', {name: o.name}), onclick: () => this.actions.switchTo(o.id, year)},
              h('span.jp-cross-text', h('em', o.name), ` ${o.where}`),
              h('span.jp-cross-when', o.km < 50 ? t('right here') : t('{km} km away', {km: (o.km >= 1000 ? Math.round(o.km / 100) * 100 : Math.round(o.km / 10) * 10).toLocaleString('en')})),
            ),
          ),
        ),
      ),
    );
  }

  /** Camera: follow the traveller (default) or show the whole route. */
  private viewToggle() {
    const btn = (follow: boolean, label: string, icon: string) =>
      h(
        'button.jp-view-btn',
        {
          type: 'button',
          title: label,
          'aria-label': label,
          onclick: () => {
            // Pressing Follow again re-centres after the reader has dragged the map away.
            if (follow && this.store.state.follow) this.actions.recenter();
            else this.store.set({follow});
          },
        },
        h('span', {html: icon}),
        h('span.jp-view-label', t(follow ? 'Follow' : 'Route')),
      );
    const follow = btn(true, t('Follow the traveller'), icons.follow);
    const route = btn(false, t('Show the whole route'), icons.route);
    this.viewBtns = {follow, route};
    return h('div.jp-view', {role: 'group', 'aria-label': t('Camera')}, follow, route);
  }

  /** Scroll a stop into view below the pinned header. */
  private reveal(el: HTMLElement) {
    const sticky = this.body.querySelector<HTMLElement>('.jp-sticky');
    const box = this.el.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const offset = r.top - box.top + this.el.scrollTop;
    const top = offset - (sticky?.offsetHeight ?? 0) - 10;
    const bottom = offset + r.height - this.el.clientHeight + 16;
    if (this.el.scrollTop > top) this.el.scrollTo({top, behavior: 'smooth'});
    else if (this.el.scrollTop < bottom) this.el.scrollTo({top: Math.min(top, bottom), behavior: 'smooth'});
  }

  private progress(s: State, geo: JourneyGeo) {
    const cur = currentStopIndex(geo, s.progress);
    const inEpilogue = geo.epilogue && s.progress > geo.stops.length - 1 + 0.5;
    this.stopEls.forEach((el, i) => {
      el.classList.toggle('done', i < cur || inEpilogue);
      const active = i === cur && !inEpilogue;
      if (active && !el.classList.contains('current')) this.reveal(el);
      el.classList.toggle('current', active);
    });
    this.epilogueEl?.classList.toggle('current', inEpilogue);
    if (this.counter) {
      this.counter.textContent = inEpilogue ? t('At home') : t('{n} of {total}', {n: cur + 1, total: geo.stops.length});
      this.counter.title = inEpilogue ? t('The news reaches home') : t('Stop {n} of {total}', {n: cur + 1, total: geo.stops.length});
    }
    if (this.viewBtns) {
      this.viewBtns.follow.classList.toggle('active', s.follow);
      this.viewBtns.follow.setAttribute('aria-pressed', String(s.follow));
      this.viewBtns.route.classList.toggle('active', !s.follow);
      this.viewBtns.route.setAttribute('aria-pressed', String(!s.follow));
    }
    if (this.playBtn) {
      setIcon(this.playBtn, s.playing ? icons.pause : icons.play);
      this.playBtn.setAttribute('aria-label', t(s.playing ? 'Pause journey' : 'Play journey'));
    }
  }
}

interface Entry {
  id: string;
  name: string;
  members: Journey[];
  t0: number;
  t1: number;
}

function entryOf(id: string, name: string, members: Journey[]): Entry {
  return {id, name, members, t0: Math.min(...members.map(j => j.t[0])), t1: Math.max(...members.map(j => j.t[j.t.length - 1]))};
}

/** Lower case, accents and ʻokina dropped, so "ibn battuta" finds "Ibn Baṭṭūṭa". */
const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f'ʻʼ’]/g, '').toLowerCase();
