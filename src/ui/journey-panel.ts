import type {AppData} from '../data';
import {shortCitation} from '../data';
import type {JourneyGeo} from '../journey-geo';
import {currentStopIndex} from '../journey-geo';
import type {State, Store} from '../state';
import {formatRange, formatYear} from '../time';
import type {Journey} from '../types';
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
        label,
      );
    this.listEl = h('div.jp-list-body');
    this.invItems.clear();
    if (this.tab === 'journeys') this.listEl.append(...this.journeyList());
    else this.listEl.append(...this.inventionList());
    return [
      h(
        'div.jp-head',
        h('div.jp-tabs', {role: 'tablist'}, tab('journeys', 'Journeys'), tab('inventions', 'Inventions')),
        h('button.card-close', {type: 'button', 'aria-label': 'Close', onclick: () => this.store.set({panel: 'none'}), html: icons.close}),
      ),
      this.listEl,
    ];
  }

  private journeyList(): Node[] {
    const groups: [string, (j: Journey) => boolean][] = [
      ['Antiquity', j => firstYear(j) < 500],
      ['500 – 1400', j => firstYear(j) >= 500 && firstYear(j) < 1400],
      ['1400 – 1800', j => firstYear(j) >= 1400 && firstYear(j) < 1800],
      ['The last frontiers', j => firstYear(j) >= 1800],
    ];
    const f = FILTERS.find(x => x.id === this.filter) ?? FILTERS[0];
    const fits = (j: Journey) => f.id === 'all' || f.kinds.includes(j.kind);
    const sorted = [...this.data.journeys].sort((a, b) => firstYear(a) - firstYear(b));
    const filters = h(
      'div.jp-filters',
      {role: 'group', 'aria-label': 'Kind of journey'},
      FILTERS.map(x => {
        const n = x.id === 'all' ? sorted.length : sorted.filter(j => x.kinds.includes(j.kind)).length;
        if (!n) return null;
        return h(
          'button.jp-filter',
          {
            type: 'button',
            'aria-pressed': String(x.id === f.id),
            class: x.id === f.id ? 'active' : '',
            onclick: () => {
              this.filter = x.id;
              this.listEl?.replaceChildren(...this.journeyList());
            },
          },
          x.label,
          h('span.jp-filter-n', String(n)),
        );
      }),
    );
    return [
      h('p.jp-intro', 'The trail shows what the traveller saw. The fog lifts only when the news reaches home.'),
      filters,
      ...groups.map(([title, g]) => {
        const js = sorted.filter(j => g(j) && fits(j));
        if (!js.length) return null;
        return h(
          'section.jp-group',
          h('h3.card-h', title),
          h(
            'ul.jp-list',
            js.map(j =>
              h(
                'li',
                h(
                  'button.jp-item',
                  {type: 'button', style: `--chip:${this.data.vp[j.viewpoint].color}`, onclick: () => this.actions.start(j.id)},
                  h('span.jp-item-icon', {html: kindIcons[j.kind] ?? kindIcons.traveler}),
                  h('span.jp-item-text', h('span.jp-item-name', j.name), h('span.jp-item-meta', `${j.years} · ${j.kind}`)),
                ),
              ),
            ),
          ),
        );
      }),
    ].filter(Boolean) as Node[];
  }

  private inventionList(): Node[] {
    const groups: [string, number, number][] = [
      ['Before paper maps', -Infinity, 500],
      ['500 – 1400', 500, 1400],
      ['1400 – 1800', 1400, 1800],
      ['Machines and satellites', 1800, Infinity],
    ];
    return [
      h('p.jp-intro', 'Instruments and ideas that let people see, reach or record more of the world. Each marks its place of origin on the map for a century.'),
      ...groups.map(([title, a, b]) => {
        const list = this.data.inventions.filter(x => x.mid >= a && x.mid < b);
        if (!list.length) return null;
        return h(
          'section.jp-group',
          h('h3.card-h', title),
          h(
            'ul.jp-list',
            list.map(x => {
              const vp = x.vp ? this.data.vp[x.vp] : null;
              const btn = h(
                'button.jp-item.inv-item',
                {type: 'button', style: vp ? `--chip:${vp.color}` : '', onclick: () => this.actions.openInvention(x.id)},
                h('span.jp-item-icon', {html: inventionIcons[x.category] ?? icons.invention}),
                h('span.jp-item-text', h('span.jp-item-name', x.name), h('span.jp-item-meta', `${formatRange(x.year)} · ${x.place}`)),
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
            h('div.jp-stop-when', s.date ?? formatYear(st.year)),
            h('div.jp-stop-place', s.place ?? ''),
            s.note ? h('p.jp-stop-note', s.note) : null,
            h('div.jp-stop-src', {title: this.data.sources[src]?.citation ?? src}, shortCitation(this.data.sources, src), s.confidence && s.confidence !== j.confidence ? ` · ${s.confidence} confidence` : ''),
          ),
        );
        this.stopEls.push(li);
        return li;
      }),
    );
    if (geo.epilogue) {
      this.epilogueEl = h(
        'li.jp-stop.epilogue',
        {onclick: () => this.store.set({progress: geo.stops.length, playing: false})},
        h('span.jp-stop-dot'),
        h('div.jp-stop-text', h('div.jp-stop-when', formatYear(geo.homeKnows)), h('div.jp-stop-place', 'The news reaches home'), h('p.jp-stop-note', 'Only now does the fog lift.')),
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
          h('div.card-kicker', {style: `color:${vp.color}`}, h('span.kicker-icon', {html: kindIcons[j.kind] ?? ''}), `${j.kind} · ${j.years}`),
          h('button.card-close', {type: 'button', 'aria-label': 'Close journey', onclick: () => this.actions.close(), html: icons.close}),
        ),
        h('h2.card-title', j.name),
        h(
          'div.jp-controls',
          h('button.jp-step', {type: 'button', 'aria-label': 'Previous stop', onclick: () => this.actions.step(-1), html: icons.prev}),
          this.playBtn,
          h('button.jp-step', {type: 'button', 'aria-label': 'Next stop', onclick: () => this.actions.step(1), html: icons.next}),
          this.counter,
          this.viewToggle(),
        ),
      ),
      j.traveler ? h('p.jp-traveller', j.traveler) : null,
      h('p.jp-summary', j.summary),
      h(
        'div.jp-lifts',
        h('h3.card-h', 'Lifts the fog'),
        h(
          'ul',
          [...informed].map(([v, list]) => {
            const SHOW = 6;
            const item = (x: {region: string; year: number}, i: number) => [
              i ? ', ' : '',
              h('button.linkish', {type: 'button', onclick: () => this.actions.openRegion(x.region)}, this.data.regionById.get(x.region)?.name ?? x.region),
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
                  `and ${list.length - SHOW} more`,
                )
              : null;
            return h(
              'li',
              h('span.jp-lift-vp', {style: `color:${this.data.vp[v as keyof AppData['vp']].color}`}, this.data.vp[v as keyof AppData['vp']].name),
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
      h('h3.card-h', 'Crossed paths'),
      h(
        'ul.jp-cross-list',
        j.crossings.map(c => {
          const other = this.data.journeyById.get(c.journey);
          if (!other) return null;
          const color = this.data.vp[other.viewpoint].color;
          const text =
            c.kind === 'meanwhile'
              ? [h('em', other.name), ` was at ${c.otherPlace}, ${Math.round(c.km / 10) * 10} km from ${c.place}.`]
              : [h('em', other.name), ` ${c.otherT < c.t ? 'had passed through' : 'would pass through'} ${c.otherPlace} in ${formatYear(c.otherT)}.`];
          return h(
            'li.jp-cross',
            {style: `--chip:${color}`},
            h(
              'button.jp-cross-main',
              {type: 'button', title: 'Go to this moment', onclick: () => this.actions.jumpTo(c.t)},
              h('span.jp-cross-when', `${formatYear(c.t)} · ${c.place}`),
              h('span.jp-cross-text', text),
            ),
            h('button.jp-cross-follow', {type: 'button', title: `Follow ${other.name} from here`, 'aria-label': `Follow ${other.name}`, onclick: () => this.actions.switchTo(other.id, c.otherT), html: kindIcons[other.kind] ?? icons.arrow}),
          );
        }),
      ),
    );
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
      h('h3.card-h', 'Meanwhile'),
      h(
        'ul.jp-cross-list',
        others.map(o =>
          h(
            'li.jp-cross',
            {style: `--chip:rgb(${o.color.join(',')})`},
            h(
              'button.jp-cross-main',
              {type: 'button', title: `Follow ${o.name} instead`, onclick: () => this.actions.switchTo(o.id, year)},
              h('span.jp-cross-text', h('em', o.name), ` ${o.where}`),
              h('span.jp-cross-when', o.km < 50 ? 'right here' : `${Math.round(o.km / 10) * 10 >= 1000 ? (Math.round(o.km / 100) * 100).toLocaleString('en') : Math.round(o.km / 10) * 10} km away`),
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
        h('span.jp-view-label', follow ? 'Follow' : 'Route'),
      );
    const follow = btn(true, 'Follow the traveller', icons.follow);
    const route = btn(false, 'Show the whole route', icons.route);
    this.viewBtns = {follow, route};
    return h('div.jp-view', {role: 'group', 'aria-label': 'Camera'}, follow, route);
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
      this.counter.textContent = inEpilogue ? 'At home' : `${cur + 1} of ${geo.stops.length}`;
      this.counter.title = inEpilogue ? 'The news reaches home' : `Stop ${cur + 1} of ${geo.stops.length}`;
    }
    if (this.viewBtns) {
      this.viewBtns.follow.classList.toggle('active', s.follow);
      this.viewBtns.follow.setAttribute('aria-pressed', String(s.follow));
      this.viewBtns.route.classList.toggle('active', !s.follow);
      this.viewBtns.route.setAttribute('aria-pressed', String(!s.follow));
    }
    if (this.playBtn) {
      setIcon(this.playBtn, s.playing ? icons.pause : icons.play);
      this.playBtn.setAttribute('aria-label', s.playing ? 'Pause journey' : 'Play journey');
    }
  }
}

function firstYear(j: Journey) {
  return j.stops.find(s => !s.waypoint)?.year ?? 0;
}
