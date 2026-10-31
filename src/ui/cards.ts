import type {AppData} from '../data';
import {dataUrl, landmarkKnown, loadPictures, nameFor, phaseAt, shortCitation} from '../data';
import type {FogField} from '../fog/field';
import {cityStatus} from '../map/overlay';
import type {State, Store} from '../state';
import {formatRange, formatYear, mainScale, START} from '../time';
import type {City, Depiction, DepictionKind, Invention, Journey, Living, NameEntry, Region, RegionEvent, VpId} from '../types';
import {ALL_VPS, CONFIDENCE_NAMES, HUMANITY_LEVEL_NAMES, LEVEL_NAMES} from '../types';
import {isZh, t, tx} from '../i18n';
import {h} from './dom';
import {icons, inventionIcons, kindIcons, livingIcons, naturalIcons} from './icons';
import {JourneySketchPlayback, journeyPageStep, journeySceneAt} from '../journey-scenes';
import type {ScenePlate} from './journey-card';

const LEVEL_ALPHA = [0, 0.16, 0.32, 0.52, 0.74, 0.94];

export function levelName(vp: VpId, level: number) {
  return t((vp === 'humanity' ? HUMANITY_LEVEL_NAMES : LEVEL_NAMES)[level] ?? '');
}

const vpName = (data: AppData, vp: VpId) => tx.viewpoint(vp, 'name', data.vp[vp].name);

/** A name in the current language, with the original beside it when that adds something. */
function shownName(n: NameEntry): {name: string; native: string | null} {
  const name = tx.name(n.name);
  const native = n.native && n.native !== name ? n.native : isZh() && name !== n.name ? n.name : null;
  return {name, native: native && native !== name ? native : null};
}

type Child = Node | string | null | undefined | false;
type LandmarkTarget = {id: string; name: string; year: number};

/** Where a journey is opened from: a city or landmark, a region, or a point (where a plant or animal arrived). */
export type JourneyAt = {city?: string; region?: string; point?: [number, number]};

/**
 * Replace an element's content only when `key` changes, and let the new content fade in. Text that changes
 * every year (the year itself) is written directly instead, so nothing flickers while the timeline plays.
 */
function swap(el: HTMLElement, key: string, content: () => Child[]) {
  if (el.dataset.k === key) return;
  const first = el.dataset.k === undefined;
  el.dataset.k = key;
  el.replaceChildren(...(content().filter(Boolean) as Node[]));
  if (first) return;
  el.classList.remove('swap');
  void el.offsetWidth;
  el.classList.add('swap');
}

/**
 * The right-hand card: a region, a city, a landmark, an invention, a plant or animal. It sits under the
 * journey card while a journey is followed. A card is built once per subject and viewpoint;
 * as the year changes only its year-dependent parts update in place, so it can be read and scrolled while
 * the timeline plays.
 */
export class Cards {
  el: HTMLElement;
  /** The card is a fixed frame (holding the close button) around this scrolling area. */
  private scroller: HTMLElement;
  private body: HTMLElement;
  /** What the card shows, and through whose eyes: `kind:id|viewpoints`. */
  private key = '';
  /** Updates the year-dependent parts of the current card. */
  private live: ((s: State) => void) | null = null;
  private inventionPlate: Plate | null = null;
  private landmarkPlate: Plate | null = null;
  /** The pending swap from one card's words to the next. */
  private leaving = 0;
  private lightbox: HTMLElement | null = null;

  constructor(
    private data: AppData,
    private store: Store,
    private field: FogField,
    private actions: {
      openRegion(id: string): void;
      /** Open a journey, at the stop where it comes to this place when there is one. */
      openJourney(id: string, at?: JourneyAt): void;
      openInvention(id: string): void;
      openLiving(id: string, year?: number): void;
      pickArrival(index: number): void;
      openCity(id: string): void;
      landmarkNeighbors(id: string): {previous?: LandmarkTarget; next?: LandmarkTarget} | null;
      openLandmark(id: string): void;
      flyTo(lng: number, lat: number, zoom?: number): void;
    },
  ) {
    this.body = h('div.card-body');
    this.scroller = h('div.card-scroll', this.body);
    this.el = h(
      'aside.card.panel',
      this.scroller,
      h('button.card-close', {type: 'button', 'aria-label': t('Close'), onclick: () => this.close(), html: icons.close}),
    );
    this.el.hidden = true;
    // Once scrolled, the text fades out under the top edge and the close button gets a backing.
    this.scroller.addEventListener('scroll', () => this.el.classList.toggle('scrolled', this.scroller.scrollTop > 4), {passive: true});
  }

  close() {
    this.store.set({region: null, regionCell: null, city: null, invention: null, living: null});
  }

  update(s: State) {
    const subject = s.invention ? `invention:${s.invention}` : s.living ? `living:${s.living}` : s.city ? `city:${s.city}` : s.region ? `region:${s.region}:${s.regionCell}` : '';
    this.el.hidden = !subject;
    document.body.classList.toggle('has-card', !!subject || !!s.journey);
    if (!subject) {
      clearTimeout(this.leaving);
      this.key = '';
      this.live = null;
      this.inventionPlate = null;
      this.landmarkPlate = null;
      return;
    }
    const key = `${subject}|${s.vps.join()}`;
    if (key !== this.key) {
      const sameSubject = this.key.split('|')[0] === subject;
      const changingInvention = !sameSubject && this.key.startsWith('invention:') && subject.startsWith('invention:');
      const landmark = s.city && !s.invention && !s.living ? this.actions.landmarkNeighbors(s.city) : null;
      const changingLandmark = !sameSubject && !!landmark && this.key.startsWith('city:') && !!this.actions.landmarkNeighbors(this.key.split('|')[0].slice(5));
      if (!subject.startsWith('invention:')) this.inventionPlate = null;
      if (!landmark) this.landmarkPlate = null;
      this.key = key;
      this.live = null;
      let nodes: Node[] = [];
      if (s.invention) {
        const x = this.data.inventionById.get(s.invention);
        if (x) nodes = this.invention(x);
      } else if (s.living) {
        const x = this.data.livingById.get(s.living);
        if (x) nodes = this.living(x, s);
      } else if (s.city) {
        const c = this.data.cityById.get(s.city);
        if (c) nodes = this.city(c, s);
      } else if (s.region) {
        const r = this.data.regionById.get(s.region);
        if (r) nodes = this.region(r, s);
      }
      const enter = () => {
        this.body.replaceChildren(...nodes);
        // A new subject starts at the top; a new viewpoint on the same one keeps the reader's place.
        if (!sameSubject) {
          this.scroller.scrollTop = 0;
          this.el.classList.remove('scrolled');
        }
      };
      clearTimeout(this.leaving);
      this.body.classList.remove('card-enter');
      if (changingInvention || changingLandmark) {
        // The old words fade out before the new ones fade in, so no text ever cuts to half-tone;
        // the sketch stays put and crossfades on its own once the new one has decoded.
        const words = (list: Iterable<Node>) => [...list].filter((n): n is Element => n instanceof Element && !n.classList.contains('plate'));
        for (const node of words(this.body.children)) node.classList.add('leave');
        this.leaving = window.setTimeout(() => {
          enter();
          for (const node of words(nodes)) node.classList.add('arrive');
        }, 140);
      } else {
        enter();
        void this.body.offsetWidth;
        this.body.classList.add('card-enter');
      }
    }
    this.live?.(s);
  }

  // ── Region ───────────────────────────────────────────────────────────────

  private region(r: Region, s: State): Node[] {
    const vp = s.vps[0];
    const cell = s.regionCell ?? -1;
    const vpData = this.data.vp[vp];
    const called = h('p.card-called');
    const swatch = h('span.fog-swatch');
    const level = h('strong');
    const year = h('span');
    const conf = h('span.conf');
    // Where it lies and what it is to the viewpoint you look through, then the journeys that went there and how
    // that viewpoint came to know it; the comparison across every viewpoint and the names come last, for reference.
    const parents = r.parents.map(id => this.data.regionById.get(id)).filter(Boolean) as Region[];
    const out: Node[] = [
      h('div.card-kicker', t(r.surface === 'sea' ? 'Sea' : r.body ? 'Beyond Earth' : 'Region')),
      h('h2.card-title', tx.region(r.id, r.name)),
      parents.length
        ? h(
            'p.card-part.card-part-top',
            t('Part of '),
            parents.map((p, i) => [i ? t(' and ') : '', h('button.linkish', {type: 'button', onclick: () => this.actions.openRegion(p.id)}, tx.region(p.id, p.name))]),
          )
        : null,
      called,
      h('div.card-status', swatch, h('span', level, vpData.special ? '' : t(' to {vp}', {vp: vpName(this.data, vp)}), t(' in '), year), conf),
    ].filter(Boolean) as Node[];
    if (r.journeys.length) out.push(h('h3.card-h', t('Journeys that passed through')), this.journeyChips(r.journeys, {region: r.id}));
    const evs = this.events(r, vp);
    if (evs.length) out.push(h('h3.card-h', t('How {vp} came to know it', {vp: vpData.special ? t('people') : vpName(this.data, vp)})), h('ol.events', evs));
    if (vp === 'polynesia') {
      out.push(
        h('p.card-note', t('Polynesian knowledge was carried in navigation lore and oral tradition. These dates come from archaeology and genetics and carry wide ranges.')),
      );
    }
    let ribbons: SVGElement | null = null;
    if (cell >= 0) out.push(h('h3.card-h', t('Who knew it, and when')), (ribbons = this.ribbons(cell)));
    const names = r.names.filter(n => n.vp !== '*');
    if (names.length) out.push(h('h3.card-h', t('What they called it')), namesList(this.data, names));
    const now = ribbons?.querySelector('.rb-now') ?? null;
    const calledYear = h('span');
    this.live = st => {
      const y = st.year;
      const name = r.names.find(n => n.vp === vp && (n.from === undefined || y >= n.from) && (n.to === undefined || y <= n.to));
      called.hidden = !name;
      if (name) {
        const shown = shownName(name);
        swap(called, `${name.name}|${name.native ?? ''}`, () => [
          t('Called '),
          h('em', shown.name),
          shown.native ? h('span.native', ` ${shown.native}`) : null,
          t(' by {vp} in ', {vp: vpData.special ? t('people') : vpName(this.data, vp)}),
          calledYear,
        ]);
      }
      calledYear.textContent = formatYear(y);
      const state = cell >= 0 ? this.field.cellState(vp, cell, y) : {level: 0, conf: 0};
      swatch.style.setProperty('--a', String(fogAlphaFor(state.level)));
      swap(level, String(state.level), () => [levelName(vp, state.level)]);
      year.textContent = formatYear(y);
      conf.hidden = state.level === 0;
      swap(conf, String(state.conf), () => [t('{level} confidence', {level: t(CONFIDENCE_NAMES[state.conf])})]);
      if (now) {
        const x = ribbonX(Math.max(START, y));
        now.setAttribute('x1', String(x));
        now.setAttribute('x2', String(x));
      }
    };
    return out;
  }

  private events(r: Region, vp: VpId): Node[] {
    const y = (e: RegionEvent) => (typeof e.y === 'number' ? e.y : (e.y[0] + e.y[1]) / 2);
    const rows: {e: RegionEvent; shared: boolean; via?: VpId; at?: number}[] = [];
    for (const e of r.events[vp] ?? []) rows.push({e, shared: false});
    if (vp !== 'humanity') for (const e of r.events['*'] ?? []) rows.push({e, shared: true});
    // A community also knows what its members know: what each brought when it joined, and all it learned after.
    // The same record held by the community and a member, or by two members (Ptolemy, read in Greece and Rome),
    // is listed once.
    const seen = new Set(rows.map(({e}) => `${y(e)}|${e.source}|${e.journey ?? ''}`));
    for (const {viewpoint, from, until} of this.data.vp[vp].community?.members ?? []) {
      const evs = r.events[viewpoint] ?? [];
      const before = evs.filter(e => y(e) < from).pop();
      if (before && before.level > 0) rows.push({e: before, shared: false, via: viewpoint, at: from});
      for (const e of evs) {
        const key = `${y(e)}|${e.source}|${e.journey ?? ''}`;
        if (y(e) >= from && (until === undefined || y(e) < until) && !seen.has(key)) rows.push({e, shared: false, via: viewpoint});
        seen.add(key);
      }
    }
    rows.sort((a, b) => (a.at ?? y(a.e)) - (b.at ?? y(b.e)));
    return rows.map(({e, shared, via, at}) => {
      const j = e.journey ? this.data.journeyById.get(e.journey) : null;
      const member = via ? this.data.vp[via] : null;
      return h(
        'li.event',
        h('span.event-year', at !== undefined ? formatYear(at) : formatRange(e.y)),
        h(
          'div.event-body',
          h(
            'div.event-level',
            h('span.level-dot', {style: `--a:${LEVEL_ALPHA[e.level]}`}),
            e.cap ? t('held at {level}', {level: isZh() ? levelName(vp, e.level) : levelName(vp, e.level).toLowerCase()}) : levelName(vp, e.level),
            shared ? h('span.shared', t(' · shared modern map')) : null,
            member
              ? h('span.shared.via', {style: `--via:${member.color}`}, at !== undefined
                ? t('{vp} brings it, known since {year}', {vp: vpName(this.data, via!), year: formatRange(e.y)})
                : t('through {vp}', {vp: vpName(this.data, via!)}))
              : null,
          ),
          e.note ? h('div.event-note', tx.note(e.note)) : null,
          j ? h('button.linkish.event-journey', {type: 'button', onclick: () => this.actions.openJourney(j.id, {region: r.id})}, tx.journey(j.id, 'name', j.name)) : null,
          h('div.event-src', {title: this.data.sources[e.source]?.citation ?? e.source}, shortCitation(this.data.sources, e.source), ` · ${t(CONFIDENCE_NAMES[e.conf])}`),
        ),
      );
    });
  }

  private ribbons(cell: number): SVGElement {
    const {W, L, row} = RIBBON;
    const H = ALL_VPS.length * row + 18;
    const X = ribbonX;
    const parts: string[] = [];
    ALL_VPS.forEach((vp, i) => {
      const vpd = this.data.vp[vp];
      const y0 = 4 + i * row;
      const hist = this.field.cellHistory(vp, cell);
      parts.push(`<text x="0" y="${y0 + 10}" class="rb-label">${vpName(this.data, vp)}</text>`);
      parts.push(`<line x1="${L}" x2="${W - 4}" y1="${y0 + 6}" y2="${y0 + 6}" class="rb-base"/>`);
      for (let k = 0; k < hist.length; k++) {
        const [yy, lvl] = hist[k];
        if (lvl === 0) continue;
        const end = k + 1 < hist.length ? hist[k + 1][0] : 2026;
        const a = X(Math.max(START, yy));
        const b = X(end);
        if (b <= a) continue;
        parts.push(`<rect x="${a}" y="${y0}" width="${b - a}" height="12" rx="1.5" fill="${vpd.color}" fill-opacity="${LEVEL_ALPHA[lvl]}"/>`);
      }
      const first = hist.find(([, l]) => l > 0);
      if (first) {
        const when = t(first[0] < START ? 'since {year}' : 'first known {year}', {year: formatYear(first[0])});
        parts.push(`<title>${vpName(this.data, vp)}: ${when}</title>`);
      }
    });
    parts.push(`<line x1="${L}" x2="${L}" y1="0" y2="${H - 14}" class="rb-now"/>`);
    for (const [y, label] of [
      [START, '2000 BCE'],
      [1000, '1000'],
      [1500, '1500'],
      [1900, '1900'],
    ] as [number, string][]) {
      parts.push(`<text x="${X(y)}" y="${H - 2}" class="rb-axis" text-anchor="${y === START ? 'start' : 'middle'}">${label}</text>`);
    }
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    el.setAttribute('viewBox', `0 0 ${W} ${H}`);
    el.setAttribute('class', 'ribbons');
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', t('When each viewpoint knew this place'));
    el.innerHTML = parts.join('');
    return el;
  }

  private journeyChips(ids: string[], at: JourneyAt): HTMLElement {
    return h(
      'div.chips',
      ids.map(id => {
        const j = this.data.journeyById.get(id);
        if (!j) return null;
        return h(
          'button.chip',
          {type: 'button', style: `--chip:${this.data.vp[j.viewpoint].color}`, onclick: () => this.actions.openJourney(id, at)},
          h('span.chip-icon', {html: kindIcons[j.kind] ?? kindIcons.traveler}),
          tx.journey(j.id, 'name', j.name),
        );
      }),
    );
  }

  private wonderChips(ids: string[]): HTMLElement {
    const vp = this.store.state.vps[0];
    return h(
      'div.chips',
      ids.map(id => {
        const w = this.data.cityById.get(id);
        if (!w) return null;
        const built = w.dates.founded;
        return h(
          'button.chip.wonder-chip',
          {type: 'button', onclick: () => this.actions.openCity(id)},
          h('span.chip-icon', {html: w.kind === 'natural' ? naturalIcons[w.subtype ?? ''] ?? icons.natural : icons.built}),
          tx.name(nameFor(w.names, vp, this.store.state.year, w.id)!.name),
          built !== undefined ? h('span.chip-meta', formatRange(built)) : null,
        );
      }),
    );
  }

  private inventionChips(ids: string[]): HTMLElement {
    return h(
      'div.chips',
      ids.map(id => {
        const x = this.data.inventionById.get(id);
        if (!x) return null;
        return h(
          'button.chip.invention-chip',
          {type: 'button', onclick: () => this.actions.openInvention(id)},
          h('span.chip-icon', {html: inventionIcons[x.category] ?? icons.invention}),
          tx.invention(x.id, 'name', x.name),
          h('span.chip-meta', formatRange(x.year)),
        );
      }),
    );
  }

  // ── City ─────────────────────────────────────────────────────────────────

  private city(c: City, s: State): Node[] {
    const vp = s.vps[0];
    const neighbors = this.actions.landmarkNeighbors(c.id);
    const kicker = h('div.card-kicker');
    const title = h('h2.card-title');
    const statusText: Record<string, string> = {
      unborn: t('Not yet founded'),
      living: t(c.kind === 'natural' ? 'Natural wonder' : c.kind === 'built' ? 'Landmark' : c.tier === 1 ? 'Great city' : c.tier === 2 ? 'City' : 'Town'),
      ruin: t('Ruin'),
      lost: t('Lost'),
      rediscovered: t('Rediscovered ruin'),
    };
    const out: Node[] = [kicker, title];
    const plate = c.pictures
      ? new Plate(
          this.data,
          {
            kind: c.kind ?? 'city',
            id: c.id,
            pick: c.kind ? items => items[0] ?? null : eraAt,
            label: d => c.kind === 'natural' ? t('Landscape study') : c.kind === 'built' ? `${t('Architectural study')} · ${formatYear(d.from ?? 0)}` : formatYear(d.from ?? 0),
            range: d => c.kind === 'natural' ? t('Landscape study') : c.kind === 'built' ? `${t('Architectural study')} · ${formatYear(d.from ?? 0)}` : eraRange(d),
            jump: d => { if (!c.kind) this.store.set({year: d.from ?? 0, playing: false}); },
          },
          vp,
          (d, title, caption, range) => this.openLightbox(d, title, caption, range),
          neighbors ? this.landmarkPlate ?? undefined : undefined,
        )
      : null;
    if (neighbors) this.landmarkPlate = plate;
    if (plate) out.push(plate.el);
    if (c.story) out.push(h('p.card-story', tx.story(c.id, c.story)));
    const labels: Record<string, string> = {
      founded: t(c.kind === 'built' ? 'Built' : c.kind === 'natural' ? 'Appeared' : 'Founded'),
      peak: t('At its height'),
      abandoned: t('Abandoned'),
      forgotten: t('Forgotten'),
      rediscovered: t('Rediscovered'),
    };
    const dl = h('dl.dates');
    if (c.kind) {
      // A landmark was there to be found: when this viewpoint first came to know its surroundings.
      const known = landmarkKnown(this.data, this.field, c, vp);
      // Known from the day it was built or appeared: the date below says it once.
      const f = c.dates.founded;
      const from = f === undefined ? null : typeof f === 'number' ? f : (f[0] + f[1]) / 2;
      if (from === null || Math.round(known) !== Math.round(from)) {
        dl.append(
          h('dt', t(vp === 'humanity' ? 'First reached' : 'Known to {vp}', {vp: vpName(this.data, vp)})),
          h('dd', known <= START ? t('since {year}', {year: formatYear(known)}) : formatYear(known)),
        );
      }
    }
    for (const k of ['founded', 'peak', 'abandoned', 'forgotten', 'rediscovered'] as const) {
      const d = c.dates[k];
      if (d === undefined) continue;
      const v = k === 'founded' && typeof d === 'number' && d < -2000 ? t('by {year}', {year: formatYear(d)}) : formatRange(d);
      dl.append(h('dt', labels[k]), h('dd', v));
    }
    out.push(h('h3.card-h', t('Dates')), dl);
    // A landmark built, abandoned and rebuilt (the Great Wall): its ages, the current one marked.
    const phases = c.path?.phases ?? [];
    const ageEls = phases.map(p =>
      h(
        'li',
        h(
          'button.age',
          {type: 'button', class: p.idle ? 'idle' : '', onclick: () => this.store.set({year: Math.max(START, p.from), playing: false})},
          h('span.age-name', tx.phase(c.id, p.id, 'name', p.name)),
          h('span.age-years', p.to === undefined ? t('from {year}', {year: formatYear(p.from)}) : formatRange([p.from, p.to])),
          h('span.age-note', tx.phase(c.id, p.id, 'note', p.note)),
        ),
      ),
    );
    if (phases.length) out.push(h('h3.card-h', t('Through the ages')), h('ol.ages', ageEls));
    const names = c.names;
    if (names.length > 1) out.push(h('h3.card-h', t('Names over time')), namesList(this.data, names));
    if (c.journeys.length) out.push(h('h3.card-h', t('Journeys that stopped here')), this.journeyChips(c.journeys, {city: c.id}));
    // A city's wonders, too close to draw apart, are listed here; a wonder's card leads back to its city.
    if (c.wonders?.length) out.push(h('h3.card-h', t('Wonders here')), this.wonderChips(c.wonders));
    if (c.inventions?.length) out.push(h('h3.card-h', t('Invented here')), this.inventionChips(c.inventions));
    // Where it is: the city a wonder stands in, then the region ("In Granada, Iberia").
    const host = c.host ? this.data.cityById.get(c.host) : undefined;
    const r = c.region !== null ? this.data.regions[c.region] : undefined;
    if (host || r) {
      out.push(
        h(
          'p.card-part',
          t('In '),
          host ? h('button.linkish', {type: 'button', onclick: () => this.actions.openCity(host.id)}, tx.name(nameFor(host.names, vp, s.year, host.id)!.name)) : null,
          host && r ? t(', ') : null,
          r ? h('button.linkish', {type: 'button', onclick: () => this.actions.openRegion(r.id)}, tx.region(r.id, r.name)) : null,
        ),
      );
    }
    out.push(
      h('p.card-src', {title: this.data.sources[c.source]?.citation ?? c.source}, `${t('Source:')} ${shortCitation(this.data.sources, c.source)} · ${t('{level} confidence', {level: t(c.confidence)})}`),
    );
    if (neighbors) {
      const nav = (other: LandmarkTarget | undefined, dir: 'prev' | 'next') => other
        ? h('button.inv-nav-btn', {
            type: 'button', title: other.name,
            'aria-keyshortcuts': dir === 'prev' ? 'ArrowLeft' : 'ArrowRight',
            onclick: () => this.actions.openLandmark(other.id),
          },
          dir === 'prev' ? h('span', {html: icons.prev}) : null,
          h('span.inv-nav-text', h('span.inv-nav-when', formatYear(other.year)), h('span.inv-nav-name', other.name)),
          dir === 'next' ? h('span', {html: icons.next}) : null)
        : h('span');
      out.push(h('div.inv-nav.landmark-nav', nav(neighbors.previous, 'prev'), nav(neighbors.next, 'next')));
    }
    this.live = st => {
      const status = cityStatus(c, st.year);
      const phase = phaseAt(c, st.year);
      if (phase && status === 'living') {
        // The age the wall is in: a frontier being built and manned, or one left to fall.
        const name = tx.phase(c.id, phase.id, 'name', phase.name);
        const label = phase.idle ? 'Abandoned' : c.path?.style === 'canal' ? 'Waterway' : 'Frontier wall';
        swap(kicker, phase.id, () => [`${t(label)} · ${name}`]);
        ageEls.forEach((el, i) => el.firstElementChild!.classList.toggle('current', phases[i] === phase));
      } else swap(kicker, status, () => [statusText[status]]);
      const name = nameFor(c.names, vp, st.year, c.id)!;
      const shown = shownName(name);
      swap(title, `${name.name}|${name.native ?? ''}`, () => [shown.name, shown.native ? h('span.native', ` ${shown.native}`) : null]);
      plate?.show(st.year);
    };
    return out;
  }

  private openLightbox(d: Depiction, title: string, caption: string, range: string) {
    this.lightbox?.remove();
    const close = () => {
      box.remove();
      document.removeEventListener('keydown', onKey, true);
      this.lightbox = null;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    const box = h(
      'div.lightbox',
      {role: 'dialog', 'aria-modal': 'true', 'aria-label': title, onclick: (e: Event) => e.target === box && close()},
      h(
        'figure.lightbox-plate',
        h('img', {src: dataUrl(d.img.full), alt: `${title}, ${range}: ${t('imagined sketch')}`}),
        h(
          'figcaption',
          h('div.lightbox-head', h('span.plate-era', title), h('span.plate-range', range), d.placeholder ? h('span.plate-tag.inline', t('Placeholder')) : null),
          h('p', caption),
        ),
        h('button.card-close', {type: 'button', 'aria-label': t('Close'), onclick: close, html: icons.close}),
      ),
    );
    document.addEventListener('keydown', onKey, true);
    document.body.append(box);
    this.lightbox = box;
  }

  // ── Journey sketchbook ───────────────────────────────────────────────────

  /** A journey's sketchbook, for the journey card: the sketch for the traveller's stop, as the journey plays. */
  scenePlate(j: Journey, shown: () => void): ScenePlate {
    const real = j.stops.filter(x => !x.waypoint);
    const stopLabel = (d: Depiction) => {
      const st = real[d.stop ?? 0];
      const k = d.stop ?? 0;
      return `${shortPlace(tx.stop(j.id, k, 'place', d.place ?? ''))} · ${st?.date ? tx.stop(j.id, k, 'date', st.date) : formatYear(st?.year ?? 0)}`;
    };
    const plate = new Plate(
      this.data,
      {
        kind: 'journey',
        id: j.id,
        pick: (items, at) => journeySceneAt(items, at),
        label: d => shortPlace(tx.stop(j.id, d.stop ?? 0, 'place', d.place ?? '')),
        range: stopLabel,
        jump: d => this.store.set({progress: d.stop ?? 0, playing: false}),
        shown,
      },
      this.store.state.vps[0],
      (d, title, caption, range) => this.openLightbox(d, title, caption, range),
    );
    plate.el.classList.add('scene');
    return plate;
  }

  // ── Plant or animal ──────────────────────────────────────────────────────

  private living(x: Living, s: State): Node[] {
    const vp = s.vps[0];
    const known = x.known[vp] ?? x.origin.mid;
    const name = tx.living(x.id, 'name', x.name);
    const kicker = h('div.card-kicker.inv-kicker');
    const culture = x.origin.culture ? tx.living(x.id, 'culture', x.origin.culture) : '';
    // Every place it reached, oldest first: who came to know it there, and how.
    const order = x.spread.map((a, i) => ({a, i})).sort((p, q) => p.a.mid - q.a.mid);
    const rows = order.map(({a, i}) => {
      const who = a.vp ? this.data.vp[a.vp] : null;
      const via = a.via ? this.data.journeyById.get(a.via) : undefined;
      return h(
        'li',
        h(
          'button.age.arrival',
          {type: 'button', style: who ? `--vp:${who.color}` : '', onclick: () => this.actions.pickArrival(i)},
          h('span.age-name', tx.arrival(x.id, i, 'place', a.place), who ? h('span.arrival-vp', ` · ${vpName(this.data, who.id)}`) : null),
          h('span.age-years', formatRange(a.year)),
          h('span.age-note', tx.arrival(x.id, i, 'note', a.note)),
        ),
        via
          ? h('button.chip.arrival-via', {type: 'button', style: `--chip:${this.data.vp[via.viewpoint].color}`, onclick: () => this.actions.openJourney(via.id, {point: [a.lon, a.lat]})},
              h('span.chip-icon', {html: kindIcons[via.kind] ?? kindIcons.traveler}), tx.journey(via.id, 'name', via.name))
          : null,
      );
    });
    const out: Node[] = [
      kicker,
      h('h2.card-title', name, x.native && x.native !== name ? h('span.native', ` ${x.native}`) : null),
      h(
        'p.inv-meta',
        h('strong', x.origin.mid <= START && typeof x.origin.year === 'number' ? t('by {year}', {year: formatYear(x.origin.year)}) : formatRange(x.origin.year)),
        ' · ',
        h('button.linkish', {type: 'button', title: t('Show on the map'), onclick: () => this.actions.flyTo(x.origin.lon, x.origin.lat, 3)}, tx.living(x.id, 'place', x.origin.place)),
        culture ? ` · ${culture}` : null,
      ),
      h('p.card-story', tx.living(x.id, 'summary', x.summary)),
      h(
        'p.living-known',
        {style: `--vp:${this.data.vp[vp].color}`},
        vp === 'humanity'
          ? t('Known to people from {year}', {year: formatYear(Math.round(known))})
          : t('Known to {vp} from {year}', {vp: vpName(this.data, vp), year: known <= START ? t('before {year}', {year: formatYear(START)}) : formatYear(Math.round(known))}),
      ),
    ];
    if (x.extinct) out.push(h('p.living-extinct', `${t('Extinct')} · ${tx.living(x.id, 'extinct', x.extinct.note)}`));
    if (rows.length) out.push(h('h3.card-h', t('How it spread')), h('ol.ages.arrivals', rows));
    out.push(h('p.card-src', {title: this.data.sources[x.source]?.citation ?? x.source}, `${t('Source:')} ${shortCitation(this.data.sources, x.source)} · ${t('{level} confidence', {level: t(x.confidence)})}`));
    let shownArrival: number | null = null;
    this.live = st => {
      const gone = !!x.extinct && st.year >= x.extinct.year;
      swap(kicker, `${x.kind}|${gone}`, () => [h('span.kicker-icon', {html: livingIcons[x.kind]}), `${t(x.kind === 'plant' ? 'Plant' : 'Animal')}${gone ? ` · ${t('Extinct')}` : ''}`]);
      // Places it has not reached yet stay faint; the latest it has reached is marked.
      let latest = -1;
      order.forEach(({a}, k) => {
        if (a.mid <= st.year) latest = k;
      });
      rows.forEach((li, k) => {
        const btn = li.firstElementChild!;
        btn.classList.toggle('later', order[k].a.mid > st.year);
        btn.classList.toggle('current', k === latest);
        btn.classList.toggle('picked', order[k].i === st.arrival);
      });
      // A place picked on the map: bring its row into view.
      const picked = rows[order.findIndex(o => o.i === st.arrival)];
      if (picked && st.arrival !== shownArrival) picked.scrollIntoView({block: 'nearest', behavior: 'smooth'});
      shownArrival = st.arrival;
    };
    return out;
  }

  // ── Invention ────────────────────────────────────────────────────────────

  private invention(x: Invention): Node[] {
    const CATEGORY: Record<string, string> = {
      navigation: t('Finding the way'),
      measurement: t('Measuring the world'),
      mapping: t('Drawing the map'),
      communication: t('Carrying the news'),
      transport: t('Going further'),
      imaging: t('Seeing from afar'),
    };
    const vp = x.vp ? this.data.vp[x.vp] : null;
    const host = x.city ? this.data.cityById.get(x.city) : undefined;
    const plate = x.pictures ? new Plate(this.data, {
      kind: 'invention', id: x.id,
      pick: items => items[0] ?? null,
      label: () => formatRange(x.year),
      range: () => formatRange(x.year),
      jump: () => {},
    }, x.vp ?? this.store.state.vps[0], (d, title, caption, range) => this.openLightbox(d, title, caption, range), this.inventionPlate ?? undefined) : null;
    this.inventionPlate = plate;
    if (plate) {
      plate.el.classList.add('plate-invention');
      plate.show(x.mid);
    }
    const all = this.data.inventions;
    const i = all.indexOf(x);
    const nav = (other: Invention | undefined, dir: string) =>
      other
        ? h(
            'button.inv-nav-btn',
            {type: 'button', title: tx.invention(other.id, 'name', other.name), 'aria-keyshortcuts': dir === 'prev' ? 'ArrowLeft' : 'ArrowRight', onclick: () => this.actions.openInvention(other.id)},
            dir === 'prev' ? h('span', {html: icons.prev}) : null,
            h('span.inv-nav-text', h('span.inv-nav-when', formatRange(other.year)), h('span.inv-nav-name', tx.invention(other.id, 'name', other.name))),
            dir === 'next' ? h('span', {html: icons.next}) : null,
          )
        : h('span');
    return [
      h('div.card-kicker.inv-kicker', h('span.kicker-icon', {html: inventionIcons[x.category] ?? icons.invention}), `${t('Invention')} · ${CATEGORY[x.category] ?? x.category}`),
      h('h2.card-title', tx.invention(x.id, 'name', x.name), x.native && x.native !== tx.invention(x.id, 'name', x.name) ? h('span.native', ` ${x.native}`) : null),
      h(
        'p.inv-meta',
        h('strong', formatRange(x.year)),
        ' · ',
        // Made in a city: the place leads to the city's card, which lists what else was made there.
        host
          ? h('button.linkish', {type: 'button', title: t('See the city'), onclick: () => this.actions.openCity(host.id)}, tx.invention(x.id, 'place', x.place))
          : h('button.linkish', {type: 'button', title: t('Show on the map'), onclick: () => this.actions.flyTo(x.lon, x.lat, 4)}, tx.invention(x.id, 'place', x.place)),
        ' · ',
        vp ? h('span', {style: `color:${vp.color}`}, tx.viewpoint(vp.id, 'longName', vp.longName)) : tx.invention(x.id, 'culture', x.culture ?? ''),
      ),
      ...(plate ? [plate.el] : []),
      h('p.card-story', tx.invention(x.id, 'summary', x.summary)),
      h('h3.card-h', t('What it changed')),
      h('p.inv-changed', tx.invention(x.id, 'changed', x.changed)),
      h('p.card-src', {title: this.data.sources[x.source]?.citation ?? x.source}, `${t('Source:')} ${shortCitation(this.data.sources, x.source)} · ${t('{level} confidence', {level: t(x.confidence)})}`),
      h('div.inv-nav', nav(all[i - 1], 'prev'), nav(all[i + 1], 'next')),
    ];
  }
}

const RIBBON = {W: 320, L: 74, row: 17};
const ribbonX = (y: number) => RIBBON.L + mainScale.toX(y) * (RIBBON.W - RIBBON.L - 4);

/** A stop's place without its gloss: "Belerion (Cornwall)" → "Belerion". */
const shortPlace = (p: string) => p.replace(/\s*[(（].*[)）]$/, '');

/**
 * A card's sketch, and its larger version for when the card shows it wider than the card image is sharp:
 * the browser picks between them by the picture's width on screen and the screen's density.
 */
function sketchSources(d: Depiction): {src: string; srcset: string; sizes: string} {
  return {
    sizes: '(max-width: 760px) 92vw, calc(30vw - 46px)',
    srcset: `${dataUrl(d.img.card)} 720w, ${dataUrl(d.img.full)} 1280w`,
    src: dataUrl(d.img.card),
  };
}

function eraRange(d: Depiction) {
  return `${formatYear(d.from ?? 0)} – ${d.to === undefined ? t('today') : formatYear(d.to)}`;
}

function eraAt(eras: Depiction[], year: number): Depiction | null {
  for (let i = eras.length - 1; i >= 0; i--) {
    const e = eras[i];
    if (year >= (e.from ?? -Infinity) && (e.to === undefined || year < e.to + 1)) return e;
  }
  return null;
}

/** How a plate walks its pictures: by year through a city's eras, or by stop along a journey. */
interface PlateOrder {
  kind: DepictionKind;
  id: string;
  /** The picture for a position (a year, or journey progress). */
  pick(items: Depiction[], at: number): Depiction | null;
  /** The small label under a thumbnail, and the right-hand label beside the title. */
  label(d: Depiction): string;
  range(d: Depiction): string;
  /** Go to a picture's moment (from its thumbnail). */
  jump(d: Depiction): void;
  /** Told whenever the position is updated, once the pictures have loaded. */
  shown?(d: Depiction | null, at: number): void;
}

/**
 * A subject's picture for the current moment. The pictures load when the card opens; when the moment
 * changes the new sketch cross-fades over the old one once it has decoded, and the caption fades with it.
 */
class Plate {
  el: HTMLElement;
  private frame: HTMLElement;
  private cap: HTMLElement;
  private text: HTMLElement;
  private src: HTMLElement;
  private strip: HTMLElement;
  private pager: HTMLElement;
  private previousPage: HTMLElement;
  private nextPage: HTMLElement;
  private pageCount: HTMLElement;
  private items: Depiction[] | null = null;
  private shown: Depiction | null = null;
  private selected: Depiction | null = null;
  private at = NaN;
  private token = 0;
  private playback = new JourneySketchPlayback<Depiction>();
  private ready = false;
  private loadingTime = 0;
  private loaded = false;

  constructor(
    private data: AppData,
    private order: PlateOrder,
    private vp: VpId,
    private enlarge: (d: Depiction, title: string, caption: string, range: string) => void,
    previous?: Plate,
  ) {
    this.frame = h('button.plate-img', {
      type: 'button',
      title: t('Enlarge'),
      onclick: () => this.shown && this.enlarge(this.shown, this.title(this.shown), this.caption(this.shown), this.order.range(this.shown)),
    });
    // A fresh subject gets its own loading state, but keeps the last decoded
    // image underneath. Cloning isolates it from the old plate's async callbacks.
    const visible = previous?.frame.querySelectorAll<HTMLImageElement>('.plate-layer.in');
    const last = visible?.[visible.length - 1];
    if (last) {
      const under = last.cloneNode(true) as HTMLImageElement;
      under.classList.add('instant');
      this.frame.append(under);
    }
    this.cap = h('figcaption.plate-cap');
    this.text = h('p.plate-text');
    this.strip = h('div.plate-eras', {role: 'group', 'aria-label': t(order.kind === 'city' ? 'Other eras' : 'Other scenes')});
    this.previousPage = h('button', {type: 'button', 'aria-label': t('Previous sketch'), title: t('Previous sketch'), onclick: () => this.turnPage(-1)}, '←');
    this.nextPage = h('button', {type: 'button', 'aria-label': t('Next sketch'), title: t('Next sketch'), onclick: () => this.turnPage(1)}, '→');
    this.pageCount = h('span', {'aria-live': 'polite'});
    this.pager = h('div.plate-pages', {hidden: true}, this.previousPage, this.pageCount, this.nextPage);
    this.src = h('p.plate-src');
    this.el = h('figure.plate.loading', this.frame, this.pager, this.cap, this.text, this.strip, this.src);
    loadPictures(data, order.kind, order.id).then(doc => {
      this.loaded = true;
      const items = doc?.eras ?? doc?.scenes ?? doc?.studies;
      if (!items?.length) {
        this.el.remove();
        return;
      }
      this.items = items;
      this.el.classList.remove('loading');
      this.strip.hidden = items.length < 2;
      this.strip.replaceChildren(
        ...items.map(x =>
          h(
            'button.plate-era-btn',
            {type: 'button', 'data-id': x.id, title: `${this.title(x)} (${order.label(x)})`, 'aria-label': `${this.title(x)} (${order.label(x)})`, onclick: () => this.select(x)},
            h('img', {src: dataUrl(x.img.thumb), alt: '', decoding: 'async', loading: 'lazy'}),
            h('span', order.kind === 'journey' ? this.title(x) : order.label(x)),
          ),
        ),
      );
      if (Number.isFinite(this.at)) this.show(this.at);
    });
  }

  private get subject() {
    return `${this.order.kind}/${this.order.id}`;
  }

  private title(d: Depiction) {
    return tx.depiction(this.subject, d.id, 'title', d.title);
  }

  private caption(d: Depiction) {
    return tx.depiction(this.subject, d.id, 'caption', d.captions?.[this.vp] ?? d.caption, this.vp);
  }

  private select(d: Depiction) {
    this.playback.visit(d.stop ?? 0);
    this.playback.reset(d);
    this.selected = d;
    this.order.jump(d);
    // Another page at the same stop need not trigger a store update.
    this.show(this.order.kind === 'journey' ? d.stop ?? 0 : this.at);
  }

  thumb(): string | null {
    return this.shown ? dataUrl(this.shown.img.thumb) : null;
  }

  advance(dt: number, progress: number, speed: number): boolean {
    if (!this.loaded) {
      this.loadingTime += dt;
      return this.loadingTime < 12;
    }
    if (!this.items) return false;
    const result = this.playback.tick(this.items, progress, dt, speed, this.ready);
    if (result.page && result.page !== this.shown) {
      this.selected = result.page;
      this.show(progress);
    }
    return result.hold;
  }

  private turnPage(delta: -1 | 1) {
    if (!this.items || !this.shown) return;
    const next = journeyPageStep(this.items, this.shown, delta);
    if (next) this.select(next);
  }

  show(at: number) {
    this.at = at;
    this.playback.visit(at);
    if (!this.items) return;
    const d = this.order.kind === 'journey'
      ? journeySceneAt(this.items, at, this.selected)
      : this.order.pick(this.items, at);
    if (this.selected && this.selected !== d) this.selected = null;
    this.el.hidden = !d;
    this.order.shown?.(d, at);
    if (!d || d === this.shown) return;
    const first = !this.frame.querySelector('.plate-layer.in');
    this.shown = d;
    const range = this.order.range(d);
    const caption = this.caption(d);
    this.frame.setAttribute('aria-label', t('Enlarge: {title}', {title: this.title(d)}));
    const pages = this.order.kind === 'journey' ? this.items.filter(x => x.stop === d.stop) : [];
    this.pager.hidden = pages.length < 2;
    this.pageCount.textContent = pages.length > 1 ? t('Sketch {n} of {total}', {n: pages.indexOf(d) + 1, total: pages.length}) : '';
    this.previousPage.toggleAttribute('disabled', pages.indexOf(d) <= 0);
    this.nextPage.toggleAttribute('disabled', pages.indexOf(d) >= pages.length - 1);
    swap(this.cap, d.id, () => [h('span.plate-era', this.title(d)), h('span.plate-range', range)]);
    swap(this.text, `${d.id}|${this.vp}`, () => [caption]);
    swap(this.src, d.id, () => [
      `${t('Imagined sketch')}${d.made?.model ? ` (${d.made.model})` : ''} · ${t('after {sources}', {sources: d.sources.map(id => shortCitation(this.data.sources, id)).join(', ')})}`,
    ]);
    this.src.title = d.sources.map(id => this.data.sources[id]?.citation ?? id).join('\n');
    for (const b of this.strip.querySelectorAll<HTMLElement>('.plate-era-btn')) {
      const on = b.dataset.id === d.id;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
      if (on) {
        // Keep the current page visible in long sketchbooks without scrolling the card or document.
        const box = b.getBoundingClientRect();
        const strip = this.strip.getBoundingClientRect();
        this.strip.scrollLeft += box.left - strip.left - (this.strip.clientWidth - box.width) / 2;
      }
    }
    this.crossfade(d, first);
    // Warm the neighbours so playing on into the next picture doesn't wait for the network.
    const i = this.items.indexOf(d);
    for (const n of [this.items[i + 1], this.items[i - 1]]) if (n) Object.assign(new Image(), sketchSources(n));
  }

  private crossfade(d: Depiction, first: boolean) {
    this.ready = false;
    const token = ++this.token;
    const img = h('img.plate-layer', {...sketchSources(d), alt: `${this.title(d)}, ${this.order.range(d)}: ${t('imagined sketch')}`, decoding: 'async'});
    const tag = d.placeholder ? h('span.plate-tag', t('Placeholder')) : null;
    const reveal = () => {
      if (token !== this.token) return;
      this.ready = true;
      for (const old of this.frame.querySelectorAll('.plate-tag')) old.remove();
      if (tag) this.frame.append(tag);
      // Fade over the picture currently on top; anything older is already hidden beneath it.
      const olds = [...this.frame.querySelectorAll<HTMLElement>('.plate-layer')].filter(x => x !== img);
      const under = olds.pop();
      olds.forEach(o => o.remove());
      if (first || !under) {
        img.classList.add('in', 'instant');
        under?.remove();
        return;
      }
      const done = () => under.remove();
      // A plate can decode before its card is on the page, and a detached image would skip its transition.
      const fade = (tries: number) => {
        if (token !== this.token) return;
        if (!img.isConnected && tries < 30) return void requestAnimationFrame(() => fade(tries + 1));
        requestAnimationFrame(() => img.classList.add('in'));
        img.addEventListener('transitionend', done, {once: true});
        setTimeout(done, 1600);
      };
      fade(0);
    };
    this.frame.append(img);
    img.decode().then(reveal, reveal);
  }
}

function namesList(data: AppData, names: NameEntry[]): HTMLElement {
  const groups = new Map<string, NameEntry[]>();
  for (const n of names) {
    const k = n.vp;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(n);
  }
  return h(
    'dl.names',
    [...groups].map(([vp, list]) => [
      h('dt', {style: vp === '*' ? '' : `color:${data.vp[vp as VpId].color}`}, vp === '*' ? t('Everyone') : vpName(data, vp as VpId)),
      h(
        'dd',
        list.map((n, i) => [
          i ? h('span.sep', ' · ') : null,
          h('span.name', n.name),
          n.native && n.native !== n.name ? h('span.native', ` ${n.native}`) : null,
          n.from !== undefined || n.to !== undefined ? h('span.span', ` ${spanText(n)}`) : null,
        ]),
      ),
    ]),
  );
}

function spanText(n: NameEntry) {
  if (n.from !== undefined && n.to !== undefined) return `(${formatYear(n.from)}–${formatYear(n.to)})`;
  if (n.from !== undefined) return `(from ${formatYear(n.from)})`;
  return `(until ${formatYear(n.to!)})`;
}

export function fogAlphaFor(level: number) {
  return [1, 0.8, 0.6, 0.3, 0.17, 0][level] ?? 1;
}
