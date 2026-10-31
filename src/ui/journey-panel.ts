import type {AppData} from '../data';
import {landmarkKnown, nameFor} from '../data';
import type {FogField} from '../fog/field';
import {isListPanel, type Shelf, type State, type Store} from '../state';
import {ERAS, formatRange, formatYear, mainScale, PRESENT, START} from '../time';
import type {City, Journey, VpId} from '../types';
import {t, tx} from '../i18n';
import {h} from './dom';
import {icons, inventionIcons, kindIcons, livingIcons, naturalIcons} from './icons';
import {GROUPS} from './topbar';

/** Journey kinds grouped into the list's filters. */
const FILTERS: {id: string; label: string; kinds: string[]}[] = [
  {id: 'all', label: 'All', kinds: []},
  {id: 'sea', label: 'By sea', kinds: ['sailor', 'fleet', 'merchant route', 'group voyage', 'castaway']},
  {id: 'land', label: 'Overland', kinds: ['traveler', 'pilgrim', 'envoy', 'merchant']},
  {id: 'military', label: 'Military', kinds: ['military']},
  {id: 'science', label: 'Science', kinds: ['scientific']},
  {id: 'frontier', label: 'Frontiers', kinds: ['polar', 'mountaineering', 'deep dive', 'spaceflight']},
];

/** Left panel: the lists of journeys and landmarks, inventions and plants and animals. */
export class JourneyPanel {
  el: HTMLElement;
  private body: HTMLElement;
  private key = '';
  /** A journey was being followed at the last update, so the list coming back is the one it was opened from. */
  private wasFollowing = false;
  private filter = 'all';
  /** Viewpoint filter: null for all journeys (where the list always opens). */
  private vpFilter: VpId | null = null;
  private query = '';
  private view: 'list' | 'timeline' = 'list';
  /** Draw every journey the filters match on the map. */
  private onMap = false;
  private openEras = new Set<string>();
  /** Where the list was scrolled when a journey was opened from it, and the entry clicked, so that coming back
   * puts that entry where it was on screen even if the year (and so the "under way" section) has changed. */
  private listScroll = 0;
  private anchor: {id: string; near: boolean; offset: number} | null = null;
  private resultsEl: HTMLElement | null = null;
  private haystack = new Map<string, string>();
  private listEl: HTMLElement | null = null;
  private invItems = new Map<string, HTMLElement>();
  /** The list on show, so a switch to the panel's other face rebuilds it. */
  private listShelf: Shelf | null = null;
  private livingItems = new Map<string, HTMLElement>();
  /** The viewpoint the plants and animals list was built for. */
  private livingVp = '';
  /** A landmark's rows: one in its era, and another while it is among those built around the current year. */
  private landmarkItems = new Map<string, HTMLElement[]>();
  /** The section at the top of a list that follows the timeline (journeys under way, landmarks built around the
   * year): where it goes, how to fill it for a year, and which entries it holds now. */
  private near: {host: HTMLElement; fill: (year: number) => {ids: string; title: string; rows: () => Node[]}; ids: string; head: HTMLElement | null} | null = null;
  /** The viewpoint the landmarks list was built for; it is rebuilt when the viewpoint changes. */
  private landmarkVp = '';
  private landmarks: LandmarkEntry[] = [];
  private landmarkQuery = '';
  private landmarkKind: LandmarkEntry['group'] | null = null;
  private landmarkEras = new Set<string>();
  private landmarkResults: HTMLElement | null = null;

  constructor(
    private data: AppData,
    private store: Store,
    private field: FogField,
    private actions: {
      start(id: string): void;
      openInvention(id: string): void;
      openLiving(id: string): void;
      openCity(id: string): void;
    },
  ) {
    this.body = h('div.jp-body');
    this.el = h('aside.journey-panel.panel', this.body);
    this.el.hidden = true;
    this.el.addEventListener('click', e => {
      const li = this.key === 'list' ? (e.target as Element).closest<HTMLElement>('[data-entry]') : null;
      if (li) this.anchor = {id: li.dataset.entry!, near: !!li.closest('.jp-near'), offset: li.getBoundingClientRect().top - this.el.getBoundingClientRect().top};
    }, true);
  }

  update(s: State) {
    const mode = isListPanel(s.panel) ? 'list' : 'none';
    this.el.hidden = mode === 'none';
    // Switching between the panel's faces (Journeys, Discoveries) changes the list too.
    if (mode !== this.key || (mode === 'list' && s.shelf !== this.listShelf)) {
      // Coming back from a journey opened from the list: the list as it was left, filters and place in it.
      const returning = mode === 'list' && this.key === 'none' && this.wasFollowing && !s.journey;
      if (this.key === 'list') this.listScroll = this.el.scrollTop;
      this.key = mode;
      this.body.replaceChildren();
      if (mode === 'list') this.body.append(...this.list(returning));
      this.el.scrollTop = returning ? this.listScroll : 0;
      // After the timeline-following section has filled (it is queued the same way), before anything is drawn.
      if (returning) queueMicrotask(() => this.restoreAnchor());
    }
    this.wasFollowing = !!s.journey;
    if (mode === 'list' && s.shelf === 'landmarks' && s.vps[0] !== this.landmarkVp) this.listEl?.replaceChildren(...this.landmarkList(s));
    else if (mode === 'list' && s.shelf === 'living' && s.vps[0] !== this.livingVp) this.listEl?.replaceChildren(...this.livingList(s));
    if (mode === 'list') this.refreshNear(s.year);
    for (const [id, els] of this.landmarkItems) for (const el of els) el.classList.toggle('current', id === s.city);
    for (const [id, el] of this.invItems) el.classList.toggle('current', id === s.invention);
    for (const [id, el] of this.livingItems) el.classList.toggle('current', id === s.living);
  }

  /** Bring the entry a journey was opened from back to where it sat, once the list has settled for the new year. */
  private restoreAnchor() {
    const a = this.anchor;
    this.anchor = null;
    if (!a || this.key !== 'list') return;
    const rows = [...this.el.querySelectorAll<HTMLElement>(`[data-entry="${CSS.escape(a.id)}"]`)];
    const row = rows.find(r => !!r.closest('.jp-near') === a.near) ?? rows.find(r => !r.closest('.jp-near'));
    if (row) this.el.scrollTop += row.getBoundingClientRect().top - this.el.getBoundingClientRect().top - a.offset;
  }

  /** Keep the timeline-following section in step with the year: its heading always, its rows when they change. */
  private refreshNear(year: number) {
    const near = this.near;
    if (!near?.host.isConnected) return;
    const now = near.fill(year);
    if (now.ids !== near.ids) {
      near.ids = now.ids;
      near.head = now.ids ? h('h3.card-h') : null;
      near.host.replaceChildren(...(near.head ? [h('section.jp-group.jp-near', near.head, h('ul.jp-list', now.rows()))] : []));
    }
    if (near.head && near.head.textContent !== now.title) near.head.textContent = now.title;
  }

  /** A timeline-following section for the list about to be drawn; it fills itself for the current year. */
  private nearSection(fill: (year: number) => {ids: string; title: string; rows: () => Node[]}): HTMLElement {
    const host = h('div.jp-near-host');
    this.near = {host, fill, ids: '', head: null};
    queueMicrotask(() => this.refreshNear(this.store.state.year));
    return host;
  }

  private list(returning = false): Node[] {
    this.near = null;
    const shelf = this.store.state.shelf;
    this.listShelf = shelf;
    const tab = (id: Shelf, label: string) =>
      h(
        'button.jp-tab',
        {
          type: 'button',
          role: 'tab',
          'aria-selected': String(shelf === id),
          class: shelf === id ? 'active' : '',
          onclick: () => {
            if (shelf === id) return;
            if (id !== 'journeys') this.publishRoutes(null);
            this.key = '';
            this.store.set({shelf: id});
            this.update(this.store.state);
          },
        },
        t(label),
      );
    this.listEl = h('div.jp-list-body');
    this.invItems.clear();
    this.livingItems.clear();
    this.landmarkItems.clear();
    if (shelf === 'journeys') this.listEl.append(...this.journeyList(returning));
    else if (shelf === 'inventions') this.listEl.append(...this.inventionList());
    else if (shelf === 'living') this.listEl.append(...this.livingList(this.store.state));
    else this.listEl.append(...this.landmarkList(this.store.state));
    return [
      h(
        'div.jp-head',
        h('div.jp-tabs', {role: 'tablist'}, ...(this.store.state.panel === 'discoveries' ? [tab('inventions', 'Inventions'), tab('living', 'Species')] : [tab('journeys', 'Journeys'), tab('landmarks', 'Landmarks')])),
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
    // A party sent out from a journey is listed under it, not on its own.
    const subs = (members: Journey[]) => members.flatMap(m => this.data.journeyChildren.get(m.id) ?? []);
    for (const sr of this.data.series) {
      const members = sr.journeys.map(id => this.data.journeyById.get(id)).filter(Boolean) as Journey[];
      if (members.length) out.push(entryOf(sr.id, tx.series(sr.id, sr.name), members, subs(members)));
    }
    for (const j of this.data.journeys) {
      if (inSeries.has(j.id) || (j.parent && this.data.journeyById.has(j.parent))) continue;
      out.push(entryOf(j.id, tx.journey(j.id, 'name', j.name), [j], subs([j])));
    }
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

  /** A journey belongs to its viewpoint, and to a knowledge community its viewpoint is a member of once it has joined. */
  private inViewpoint(j: Journey, vp: VpId): boolean {
    if (j.viewpoint === vp) return true;
    const m = this.data.vp[vp].community?.members.find(x => x.viewpoint === j.viewpoint);
    return !!m && j.t[j.t.length - 1] >= m.from;
  }

  /** Which of an entry's journeys pass the filters and the search (empty: the entry is hidden). */
  private matching(e: Entry): Journey[] {
    const f = FILTERS.find(x => x.id === this.filter) ?? FILTERS[0];
    const q = fold(this.query.trim());
    return [...e.members, ...e.subs].filter(
      j => (f.id === 'all' || f.kinds.includes(j.kind)) && (!this.vpFilter || this.inViewpoint(j, this.vpFilter)) && (!q || this.searchText(j).includes(q)),
    );
  }

  /**
   * A filter as a compact menu button ("Viewpoint · All ▾"), so twenty viewpoints don't fill the panel.
   * Groups give the menu headings (the picker's regions); `get` and `set` read and change the filter.
   */
  private dropdown(
    label: string,
    groups: {title: string | null; items: {id: string | null; label: string; n: number; color?: string}[]}[],
    get: () => string | null,
    set: (id: string | null) => void,
    rerender = () => this.renderResults(),
  ): HTMLElement {
    const flat = groups.flatMap(g => g.items);
    const value = h('span.jp-drop-value');
    const dot = h('span.jp-filter-dot');
    const show = () => {
      const cur = flat.find(x => x.id === get()) ?? flat[0];
      value.textContent = cur.label;
      dot.hidden = !cur.color;
      dot.style.setProperty('--chip', cur.color ?? '');
      btn.classList.toggle('filtered', get() !== null);
    };
    const menu: HTMLElement = h(
      'div.jp-menu',
      {role: 'listbox', 'aria-label': label},
      groups.map(g => [
        g.title ? h('div.jp-menu-h', g.title) : null,
        g.items.map(x =>
          h(
            'button.jp-menu-item',
            {
              type: 'button',
              role: 'option',
              style: x.color ? `--chip:${x.color}` : '',
              onclick: () => {
                set(x.id);
                show();
                close();
                rerender();
              },
            },
            x.color ? h('span.jp-filter-dot') : h('span.jp-menu-blank'),
            h('span.jp-menu-label', x.label),
            h('span.jp-filter-n', String(x.n)),
          ),
        ),
      ]),
    );
    menu.hidden = true;
    const btn: HTMLButtonElement = h(
      'button.jp-drop-btn',
      {type: 'button', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', onclick: (e: Event) => (e.stopPropagation(), menu.hidden ? open() : close())},
      h('span.jp-drop-label', label),
      dot,
      value,
      h('span.jp-drop-caret', {html: '<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'}),
    ) as HTMLButtonElement;
    const outside = (e: Event) => {
      if (!wrap.contains(e.target as Node)) close();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    const open = () => {
      for (const it of menu.querySelectorAll<HTMLElement>('.jp-menu-item')) it.setAttribute('aria-selected', 'false');
      const i = flat.findIndex(x => x.id === get());
      menu.querySelectorAll<HTMLElement>('.jp-menu-item')[Math.max(0, i)]?.setAttribute('aria-selected', 'true');
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      document.addEventListener('click', outside);
      document.addEventListener('keydown', esc, true);
    };
    const close = () => {
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      document.removeEventListener('click', outside);
      document.removeEventListener('keydown', esc, true);
    };
    const wrap = h('div.jp-drop', btn, menu);
    show();
    return wrap;
  }

  /** Open the list at an era (from the timeline): unfold its group and bring it to the top of the panel. */
  openEra(id: string) {
    if (this.store.state.journey) return;
    if (!isListPanel(this.store.state.panel)) this.store.set({panel: 'journeys'});
    const section = this.listEl?.querySelector<HTMLElement>(`[data-era="${id}"]`);
    if (!section) return;
    const head = section.querySelector<HTMLElement>('.jp-era');
    if (head?.getAttribute('aria-expanded') === 'false') head.click();
    this.el.scrollBy({top: section.getBoundingClientRect().top - this.el.getBoundingClientRect().top - 8, behavior: 'smooth'});
  }

  private journeyList(returning = false): Node[] {
    // A fresh opening shows every viewpoint's journeys; coming back from one keeps the filter that was set.
    if (!returning) this.vpFilter = null;
    const all = this.data.journeys;
    const vpItems = (ids: VpId[]) =>
      ids
        .map(v => ({id: v as string | null, label: tx.viewpoint(v, 'name', this.data.vp[v].name), n: all.filter(j => this.inViewpoint(j, v)).length, color: this.data.vp[v].color}))
        .filter(x => x.n);
    const vpDrop = this.dropdown(
      t('Viewpoint'),
      [
        {title: null, items: [{id: null, label: t('All'), n: all.length}]},
        ...GROUPS.map(([title, ids]) => ({title: t(title), items: vpItems(ids)})).filter(g => g.items.length),
      ],
      () => this.vpFilter,
      id => (this.vpFilter = id as VpId | null),
    );
    const kindDrop = this.dropdown(
      t('Kind'),
      [{title: null, items: FILTERS.map(x => ({id: x.id === 'all' ? null : x.id, label: t(x.label), n: x.id === 'all' ? all.length : all.filter(j => x.kinds.includes(j.kind)).length})).filter(x => x.n)}],
      () => (this.filter === 'all' ? null : this.filter),
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
          title: t(label),
          'aria-label': t(label),
          onclick: (e: Event) => {
            this.view = v;
            for (const b of (e.currentTarget as HTMLElement).parentElement!.children) b.classList.toggle('active', b === e.currentTarget);
            this.renderResults();
          },
        },
        h('span', {html: icon}),
      );
    const mapBtn = h(
      'button.jp-view-btn.jp-map-btn',
      {
        type: 'button',
        class: this.onMap ? 'active' : '',
        'aria-pressed': String(this.onMap),
        title: t('Show every journey that matches on the map'),
        'aria-label': t('Show every journey that matches on the map'),
        onclick: (e: Event) => {
          this.onMap = !this.onMap;
          const b = e.currentTarget as HTMLElement;
          b.classList.toggle('active', this.onMap);
          b.setAttribute('aria-pressed', String(this.onMap));
          this.renderResults();
        },
      },
      h('span', {html: icons.route}),
    );
    this.resultsEl = h('div.jp-results');
    this.renderResults();
    return [
      h(
        'div.jp-tools',
        h('div.jp-search-row', h('span.jp-search-icon', {html: icons.search}), search),
        h('div.jp-view.jp-list-view', {role: 'group', 'aria-label': t('View')}, viewBtn('list', 'List', icons.list), viewBtn('timeline', 'Timeline', icons.timeline)),
      ),
      h('div.jp-filter-row', vpDrop, kindDrop, h('div.jp-view.jp-map-toggle', mapBtn)),
      this.resultsEl,
    ];
  }

  /** Tell the map which routes to draw: the filters' matches while "On map" is on. */
  private publishRoutes(ids: string[] | null) {
    const cur = this.store.state.routes;
    if (ids === cur || (ids && cur && ids.join() === cur.join())) return;
    // Results can be re-rendered while the store is telling everyone about a change; set it afterwards.
    queueMicrotask(() => this.store.set({routes: ids}));
  }

  private renderResults() {
    const el = this.resultsEl;
    if (!el) return;
    const entries = this.entries()
      .map(e => ({e, hits: this.matching(e)}))
      .filter(x => x.hits.length);
    this.publishRoutes(this.onMap ? entries.flatMap(x => x.hits.map(j => j.id)) : null);
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
    if (!searching) {
      out.push(
        this.nearSection(year => {
          if (year < START) return {ids: '', title: '', rows: () => []};
          // A century either side in antiquity, a generation or two in the crowded centuries since; the nearest eight.
          const span = year > 1500 ? 40 : 100;
          const near = entries
            .filter(({e}) => e.t0 <= year + span && e.t1 >= year - span)
            .sort((a, b) => Math.abs((a.e.t0 + a.e.t1) / 2 - year) - Math.abs((b.e.t0 + b.e.t1) / 2 - year))
            .slice(0, 8);
          return {ids: near.map(x => x.e.id).join(), title: t('Under way around {year}', {year: formatYear(Math.round(year))}), rows: () => near.map(x => this.row(x.e, x.hits))};
        }),
      );
    }
    for (const era of ERAS) {
      const list = entries.filter(({e}) => e.t0 >= era.from && e.t0 < era.to);
      if (!list.length) continue;
      const n = list.reduce((k, x) => k + x.hits.length, 0);
      const open = openAll || this.openEras.has(era.id);
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
            if (now) this.openEras.add(era.id);
            else this.openEras.delete(era.id);
          },
        },
        h('span.jp-era-title', t(era.name)),
        h('span.jp-era-n', String(n)),
        h('span.jp-era-caret', {html: icons.next}),
      );
      out.push(h('section.jp-group', {'data-era': era.id}, head, body));
    }
    return out;
  }

  /** One row: a journey, or a series with a numbered chip for each voyage. */
  private row(e: Entry, hits: Journey[]): HTMLElement {
    const first = e.members[0];
    const color = this.data.vp[first.viewpoint].color;
    const main = h(
      'button.jp-item',
      {type: 'button', style: `--chip:${color}`, onclick: () => this.actions.start((hits.find(j => e.members.includes(j)) ?? first).id)},
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
    const subs = this.subRows(e, hits);
    if (e.members.length === 1) return h('li', {'data-entry': e.id}, main, subs);
    const searching = !!this.query.trim();
    return h(
      'li.jp-series',
      {'data-entry': e.id},
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
      subs,
    );
  }

  /** The parties an entry's journeys sent out, indented beneath it; dimmed when the filters leave them out. */
  private subRows(e: Entry, hits: Journey[]): HTMLElement | null {
    if (!e.subs.length) return null;
    return h(
      'ul.jp-subs',
      e.subs.map(j =>
        h(
          'li',
          h(
            'button.jp-sub',
            {type: 'button', class: hits.includes(j) ? '' : 'dim', style: `--chip:${this.data.vp[j.viewpoint].color}`, onclick: () => this.actions.start(j.id)},
            h('span.jp-sub-icon', {html: kindIcons[j.kind] ?? kindIcons.traveler}),
            h('span.jp-sub-name', tx.journey(j.id, 'name', j.name)),
            h('span.jp-sub-meta', tx.journey(j.id, 'years', j.years)),
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
    for (const [y, label] of [[START, formatYear(START)], [-1000, formatYear(-1000)], [0, formatYear(1)], [500, '500'], [1000, '1000'], [1500, '1500'], [1800, '1800'], [1900, '1900']] as [number, string][]) {
      const x = X(y);
      parts.push(`<line x1="${x}" x2="${x}" y1="14" y2="${H}" class="g-grid"/><text x="${x}" y="10" class="g-axis" text-anchor="middle">${label}</text>`);
    }
    const now = this.store.state.year;
    if (now >= START) parts.push(`<line x1="${X(now)}" x2="${X(now)}" y1="12" y2="${H}" class="g-now"/>`);
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
      for (const j of p.e.subs) {
        const a = X(j.t[0]);
        const b = Math.max(a + 3, X(j.t[j.t.length - 1]));
        const bar = mk('rect', {x: a, y: y + 2.5, width: b - a, height: 3, rx: 1.5, class: p.hits.includes(j) ? 'g-bar g-sub' : 'g-bar g-sub dim'});
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
    return [
      h('p.jp-intro', t('Instruments and ideas that let people see, reach or record more of the world. Each marks its place of origin on the map for a century.')),
      ...ERAS.map(era => {
        const list = this.data.inventions.filter(x => x.mid >= era.from && x.mid < era.to);
        if (!list.length) return null;
        return h(
          'section.jp-group',
          {'data-era': era.id},
          h('h3.card-h', t(era.name)),
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

  /** Plants and animals, grouped into eras by when this viewpoint came to know each: maize for China in the
   * age of discovery, the horse for China in its early kingdoms. A click opens it at that year. */
  private livingList(s: State): Node[] {
    const vp = s.vps[0];
    this.livingVp = vp;
    this.livingItems.clear();
    const vpName = tx.viewpoint(vp, 'name', this.data.vp[vp].name);
    const all = this.data.living
      .map(x => ({x, from: Math.max(START, Math.min(PRESENT, x.known[vp] ?? x.origin.mid))}))
      .sort((a, b) => a.from - b.from || a.x.name.localeCompare(b.x.name));
    return [
      h('p.jp-intro', t('Crops, beasts and wonders of nature, and how word of them spread: by when {vp} came to know each. Open one to watch it travel.', {vp: vpName})),
      ...ERAS.map(era => {
        const list = all.filter(e => e.from >= era.from && e.from < era.to);
        if (!list.length) return null;
        return h(
          'section.jp-group',
          {'data-era': era.id},
          h('h3.card-h', t(era.name)),
          h(
            'ul.jp-list',
            list.map(({x, from}) => {
              const known = x.known[vp] ?? x.origin.mid;
              const when = vp === 'humanity' ? t('Known to people from {year}', {year: formatYear(Math.round(known))})
                : known <= START ? t('Known before {year}', {year: formatYear(START)}) : t('Known from {year}', {year: formatYear(Math.round(from))});
              const btn = h(
                'button.jp-item.living-item',
                {type: 'button', class: `living-${x.kind}`, onclick: () => this.actions.openLiving(x.id)},
                h('span.jp-item-icon', {html: livingIcons[x.kind]}),
                h('span.jp-item-text', h('span.jp-item-name', tx.living(x.id, 'name', x.name)), h('span.jp-item-meta', `${when} · ${tx.living(x.id, 'place', x.origin.place)}`)),
              );
              this.livingItems.set(x.id, btn);
              return h('li', btn);
            }),
          ),
        );
      }),
    ].filter(Boolean) as Node[];
  }

  /** Open a place's card at the year the viewpoint came to know it. */
  private openAt(c: City, year: number) {
    this.store.set({year: Math.max(START, Math.min(PRESENT, Math.round(year))), playing: false});
    this.actions.openCity(c.id);
  }

  /** When a viewpoint found a lost city again: its rediscovery, or later, once the viewpoint heard of it. */
  private foundAgain(c: City, vp: VpId): number {
    const d = c.dates.rediscovered!;
    return Math.max(typeof d === 'number' ? d : (d[0] + d[1]) / 2, landmarkKnown(this.data, this.field, c, vp));
  }

  /** Places a viewpoint comes to know (landmarks people built, natural wonders, lost cities found again),
   * grouped into eras by the year each entered this viewpoint's world. The grouping depends only on the
   * viewpoint, so a click that jumps the timeline leaves the list in place. */
  private landmarkList(s: State): Node[] {
    const vp = s.vps[0];
    this.landmarkVp = vp;
    this.landmarks = this.landmarkEntries(vp);
    const all = this.landmarks;
    const kinds: [LandmarkEntry['group'], string][] = [['built', 'Built'], ['natural', 'Natural wonders'], ['found', 'Found again']];
    const kindDrop = this.dropdown(
      t('Kind'),
      [{title: null, items: [{id: null, label: t('All'), n: all.length}, ...kinds.map(([id, label]) => ({id, label: t(label), n: all.filter(e => e.group === id).length}))]}],
      () => this.landmarkKind,
      id => (this.landmarkKind = id as LandmarkEntry['group'] | null),
      () => this.renderLandmarks(),
    );
    const search = h('input.jp-search', {
      type: 'search',
      placeholder: t('Find a landmark or a lost city…'),
      'aria-label': t('Find a landmark'),
      value: this.landmarkQuery,
      autocomplete: 'off',
      spellcheck: 'false',
    });
    search.addEventListener('input', () => {
      this.landmarkQuery = search.value;
      this.renderLandmarks();
    });
    search.addEventListener('keydown', e => e.stopPropagation());
    this.landmarkResults = h('div.jp-results');
    this.renderLandmarks();
    return [
      h('p.jp-intro', t('Wonders people built, wonders they found, and lost cities found again, by when {vp} came to know them.', {vp: tx.viewpoint(vp, 'name', this.data.vp[vp].name)})),
      h('div.jp-tools', h('div.jp-search-row', h('span.jp-search-icon', {html: icons.search}), search)),
      h('div.jp-filter-row', kindDrop),
      this.landmarkResults,
    ];
  }

  /** Every landmark and lost city with the year it entered a viewpoint's world. */
  private landmarkEntries(vp: VpId): LandmarkEntry[] {
    const humanity = vp === 'humanity';
    const vpName = tx.viewpoint(vp, 'name', this.data.vp[vp].name);
    const mid = (d: number | [number, number]) => (typeof d === 'number' ? d : (d[0] + d[1]) / 2);
    const out: LandmarkEntry[] = [];
    for (const c of this.data.cities) {
      let group: LandmarkEntry['group'];
      let from: number;
      let meta: string;
      if (c.kind) {
        const known = landmarkKnown(this.data, this.field, c, vp);
        group = c.kind;
        if (c.kind === 'built') {
          // A built landmark enters the viewpoint's world once it stands and the viewpoint knows the land.
          from = known;
          // Built long before this viewpoint knew of it (Borobudur, for Europe): say both.
          meta = from - mid(c.dates.founded!) > 50
            ? t('Built {built}, known from {year}', {built: formatRange(c.dates.founded!), year: formatYear(from)})
            : t('Built {year}', {year: formatRange(c.dates.founded!)});
        } else {
          from = known;
          meta = humanity ? t('Reached {year}', {year: formatYear(known)})
            : t('Known to {vp} from {year}', {vp: vpName, year: known <= START ? t('before {year}', {year: formatYear(START)}) : formatYear(known)});
        }
      } else if (c.dates.forgotten !== undefined && c.dates.rediscovered !== undefined) {
        // Cities truly lost and found again; landmarks that were lost (Borobudur) are already among the built.
        group = 'found';
        from = this.foundAgain(c, vp);
        meta = t('Found again {year}', {year: formatYear(from)});
      } else continue;
      const name = tx.name(nameFor(c.names, '*' as VpId, PRESENT, c.id)!.name);
      const host = c.host ? this.data.cityById.get(c.host) : undefined;
      if (host) meta += ` · ${t('in {city}', {city: tx.name(nameFor(host.names, vp, PRESENT, host.id)!.name)})}`;
      const hay = [name, ...c.names.flatMap(n => [n.name, tx.name(n.name), n.native ?? ''])].join(' ').toLowerCase();
      out.push({c, group, from, name, meta, hay});
    }
    return out.sort((a, b) => a.from - b.from || a.name.localeCompare(b.name));
  }

  /** Card navigation follows the complete list, just as invention cards do. */
  landmarkNeighbors(id: string) {
    const entries = this.landmarkEntries(this.store.state.vps[0]);
    const i = entries.findIndex(e => e.c.id === id);
    if (i < 0) return null;
    const target = (e: LandmarkEntry | undefined) => e ? {id: e.c.id, name: e.name, year: e.from} : undefined;
    return {previous: target(entries[i - 1]), next: target(entries[i + 1])};
  }

  openLandmark(id: string) {
    const entry = this.landmarkEntries(this.store.state.vps[0]).find(e => e.c.id === id);
    if (entry) this.openAt(entry.c, entry.from);
  }

  private renderLandmarks() {
    const el = this.landmarkResults;
    if (!el) return;
    const q = this.landmarkQuery.trim().toLowerCase();
    const list = this.landmarks.filter(e => (!this.landmarkKind || e.group === this.landmarkKind) && (!q || e.hay.includes(q)));
    if (!list.length) {
      el.replaceChildren(h('p.jp-empty', t('No landmark matches.')));
      return;
    }
    const openAll = !!q || list.length <= 12;
    this.landmarkItems.clear();
    const out: Node[] = [];
    if (!q) {
      const built = list.filter(e => e.group === 'built');
      // How far a landmark's building lies from a year; a rebuilt one (the Great Wall) was raised in each of its ages.
      const apart = (e: LandmarkEntry, year: number) => {
        const d = e.c.dates.founded!;
        const starts = [typeof d === 'number' ? d : (d[0] + d[1]) / 2, ...(e.c.path?.phases ?? []).filter(p => !p.idle).map(p => p.from)];
        return Math.min(...starts.map(y => Math.abs(y - year)));
      };
      out.push(
        this.nearSection(year => {
          // As for journeys: what was being raised within a century, or a generation or two, of the year.
          const span = year > 1500 ? 40 : 100;
          const near = built
            .filter(e => apart(e, year) <= span)
            .sort((a, b) => apart(a, year) - apart(b, year))
            .slice(0, 8);
          // A rebuilt landmark says which age was building it then: "Ming · built 1368".
          const meta = (e: LandmarkEntry) => {
            const age = (e.c.path?.phases ?? []).filter(p => !p.idle).sort((a, b) => Math.abs(a.from - year) - Math.abs(b.from - year))[0];
            const founded = e.c.dates.founded!;
            if (!age || Math.abs((typeof founded === 'number' ? founded : founded[0]) - year) <= Math.abs(age.from - year)) return undefined;
            return `${tx.phase(e.c.id, age.id, 'name', age.name)} · ${t('built {year}', {year: formatYear(age.from)})}`;
          };
          return {ids: near.map(e => e.c.id).join(), title: t('Built around {year}', {year: formatYear(Math.round(year))}), rows: () => near.map(e => this.landmarkRow(e, meta(e)))};
        }),
      );
    }
    for (const era of ERAS) {
      const group = list.filter(e => e.from >= era.from && e.from < era.to);
      if (!group.length) continue;
      const open = openAll || this.landmarkEras.has(era.id);
      const body = h('ul.jp-list', {hidden: !open}, open ? group.map(e => this.landmarkRow(e)) : []);
      const head = h(
        'button.jp-era',
        {
          type: 'button',
          'aria-expanded': String(open),
          onclick: () => {
            const now = body.hidden;
            if (now && !body.childElementCount) body.append(...group.map(e => this.landmarkRow(e)));
            body.hidden = !now;
            head.setAttribute('aria-expanded', String(now));
            if (now) this.landmarkEras.add(era.id);
            else this.landmarkEras.delete(era.id);
          },
        },
        h('span.jp-era-title', t(era.name)),
        h('span.jp-era-n', String(group.length)),
        h('span.jp-era-caret', {html: icons.next}),
      );
      out.push(h('section.jp-group', {'data-era': era.id}, head, body));
    }
    el.replaceChildren(...out);
  }

  private landmarkRow(e: LandmarkEntry, meta = e.meta): HTMLElement {
    const c = e.c;
    const btn = h(
      'button.jp-item.landmark-item',
      {type: 'button', class: `landmark-${e.group}`, onclick: () => this.openAt(c, e.from)},
      h('span.jp-item-icon', {html: e.group === 'natural' ? naturalIcons[c.subtype ?? ''] ?? icons.natural : e.group === 'built' ? icons.built : icons.ruin}),
      h('span.jp-item-text', h('span.jp-item-name', e.name), h('span.jp-item-meta', meta)),
    );
    btn.classList.toggle('current', c.id === this.store.state.city);
    this.landmarkItems.set(c.id, [...(this.landmarkItems.get(c.id) ?? []), btn]);
    return h('li', btn);
  }
}

interface Entry {
  id: string;
  name: string;
  members: Journey[];
  /** Parties the members sent out on journeys of their own (Gan Ying from Ban Chao's), listed beneath. */
  subs: Journey[];
  t0: number;
  t1: number;
}

function entryOf(id: string, name: string, members: Journey[], subs: Journey[] = []): Entry {
  return {id, name, members, subs, t0: Math.min(...members.map(j => j.t[0])), t1: Math.max(...members.map(j => j.t[j.t.length - 1]))};
}

/** Lower case, accents and ʻokina dropped, so "ibn battuta" finds "Ibn Baṭṭūṭa". */
const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f'ʻʼ’]/g, '').toLowerCase();

/** A place in the landmarks list, with the year it entered the viewpoint's world. */
interface LandmarkEntry {
  c: City;
  group: 'built' | 'natural' | 'found';
  from: number;
  name: string;
  meta: string;
  /** Every name it went by, for search. */
  hay: string;
}
