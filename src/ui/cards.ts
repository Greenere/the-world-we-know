import type {AppData} from '../data';
import {dataUrl, loadPictures, nameFor, shortCitation} from '../data';
import type {FogField} from '../fog/field';
import {cityStatus} from '../map/overlay';
import type {State, Store} from '../state';
import {formatRange, formatYear, mainScale, START} from '../time';
import type {City, Depiction, DepictionKind, Invention, Journey, NameEntry, Region, RegionEvent, VpId} from '../types';
import {ALL_VPS, CONFIDENCE_NAMES, HUMANITY_LEVEL_NAMES, LEVEL_NAMES} from '../types';
import {isZh, t, tx} from '../i18n';
import {h} from './dom';
import {icons, inventionIcons, kindIcons} from './icons';
import {JourneySketchPlayback, journeyPageStep, journeySceneAt} from '../journey-scenes';

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
 * The right-hand card: a region, a city or an invention. A card is built once per subject and viewpoint;
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
  private scenePlate: Plate | null = null;
  private inventionPlate: Plate | null = null;
  /** The pending swap from one invention's words to the next. */
  private leaving = 0;
  private lightbox: HTMLElement | null = null;
  /** For each journey with pictures, the stops that have a scene (once loaded). */
  private sceneStops = new Map<string, number[]>();
  /** The scene the reader closed (`journey:stop`); the card stays away until the traveller reaches another. */
  private dismissed: string | null = null;

  constructor(
    private data: AppData,
    private store: Store,
    private field: FogField,
    private actions: {
      openRegion(id: string): void;
      openJourney(id: string): void;
      openInvention(id: string): void;
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

  private close() {
    const s = this.store.state;
    if (s.invention || s.city || s.region) this.store.set({region: null, regionCell: null, city: null, invention: null});
    else {
      this.dismissed = this.sceneKey(s);
      this.update(s);
    }
  }

  /** Show the followed journey's sketch again after the reader closed it. */
  reopenScene() {
    this.dismissed = null;
    this.update(this.store.state);
  }

  /** Hold travel while the visible stop's sketchbook pages are being read. */
  advanceSketch(dt: number, s: State): boolean {
    return s.playing && !this.el.hidden && !!this.scenePlate?.advance(dt, s.progress, s.speed);
  }

  /** `journey:stop` of the scene for where the traveller is now, or null when the journey has no pictures. */
  private sceneKey(s: State): string | null {
    const j = s.journey ? this.data.journeyById.get(s.journey) : null;
    if (!j?.pictures) return null;
    const stops = this.sceneStops.get(j.id);
    if (!stops) {
      loadPictures(this.data, 'journey', j.id).then(doc => {
        this.sceneStops.set(j.id, (doc?.scenes ?? []).map(x => x.stop ?? 0));
        this.update(this.store.state);
      });
      return `${j.id}:?`;
    }
    if (!stops.length) return null;
    return `${j.id}:${sceneStopAt(stops, s.progress)}`;
  }

  update(s: State) {
    let subject = s.invention ? `invention:${s.invention}` : s.city ? `city:${s.city}` : s.region ? `region:${s.region}:${s.regionCell}` : '';
    if (!s.journey) this.dismissed = null;
    if (!subject) {
      const scene = this.sceneKey(s);
      if (scene && scene !== this.dismissed) subject = `scene:${s.journey}`;
    }
    this.el.hidden = !subject;
    this.el.classList.toggle('scene-card', subject.startsWith('scene:'));
    document.body.classList.toggle('has-card', !!subject);
    if (!subject) {
      clearTimeout(this.leaving);
      this.key = '';
      this.live = null;
      this.scenePlate = null;
      this.inventionPlate = null;
      return;
    }
    const key = `${subject}|${s.vps.join()}`;
    if (key !== this.key) {
      const sameSubject = this.key.split('|')[0] === subject;
      const changingInvention = !sameSubject && this.key.startsWith('invention:') && subject.startsWith('invention:');
      if (!subject.startsWith('invention:')) this.inventionPlate = null;
      this.key = key;
      this.live = null;
      this.scenePlate = null;
      let nodes: Node[] = [];
      if (subject.startsWith('scene:')) {
        nodes = this.scenes(this.data.journeyById.get(s.journey!)!, s);
      } else if (s.invention) {
        const x = this.data.inventionById.get(s.invention);
        if (x) nodes = this.invention(x);
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
      if (changingInvention) {
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
    const out: Node[] = [
      h('div.card-kicker', t(r.surface === 'sea' ? 'Sea' : r.body ? 'Beyond Earth' : 'Region')),
      h('h2.card-title', tx.region(r.id, r.name)),
      called,
      h('div.card-status', swatch, h('span', level, vpData.special ? '' : t(' to {vp}', {vp: vpName(this.data, vp)}), t(' in '), year), conf),
    ];
    let ribbons: SVGElement | null = null;
    if (cell >= 0) out.push(h('h3.card-h', t('Who knew it, and when')), (ribbons = this.ribbons(cell)));
    const names = r.names.filter(n => n.vp !== '*');
    if (names.length) out.push(h('h3.card-h', t('What they called it')), namesList(this.data, names));
    const evs = this.events(r, vp);
    if (evs.length) out.push(h('h3.card-h', t('How {vp} came to know it', {vp: vpData.special ? t('people') : vpName(this.data, vp)})), h('ol.events', evs));
    if (vp === 'polynesia') {
      out.push(
        h('p.card-note', t('Polynesian knowledge was carried in navigation lore and oral tradition. These dates come from archaeology and genetics and carry wide ranges.')),
      );
    }
    if (r.journeys.length) out.push(h('h3.card-h', t('Journeys that passed through')), this.journeyChips(r.journeys));
    const parents = r.parents.map(id => this.data.regionById.get(id)).filter(Boolean) as Region[];
    if (parents.length) {
      out.push(
        h(
          'p.card-part',
          t('Part of '),
          parents.map((p, i) => [i ? t(' and ') : '', h('button.linkish', {type: 'button', onclick: () => this.actions.openRegion(p.id)}, tx.region(p.id, p.name))]),
        ),
      );
    }
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
          j ? h('button.linkish.event-journey', {type: 'button', onclick: () => this.actions.openJourney(j.id)}, tx.journey(j.id, 'name', j.name)) : null,
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

  private journeyChips(ids: string[]): HTMLElement {
    return h(
      'div.chips',
      ids.map(id => {
        const j = this.data.journeyById.get(id);
        if (!j) return null;
        return h(
          'button.chip',
          {type: 'button', style: `--chip:${this.data.vp[j.viewpoint].color}`, onclick: () => this.actions.openJourney(id)},
          h('span.chip-icon', {html: kindIcons[j.kind] ?? kindIcons.traveler}),
          tx.journey(j.id, 'name', j.name),
        );
      }),
    );
  }

  // ── City ─────────────────────────────────────────────────────────────────

  private city(c: City, s: State): Node[] {
    const vp = s.vps[0];
    const kicker = h('div.card-kicker');
    const title = h('h2.card-title');
    const statusText: Record<string, string> = {
      unborn: t('Not yet founded'),
      living: t(c.tier === 1 ? 'Great city' : c.tier === 2 ? 'City' : 'Town'),
      ruin: t('Ruin'),
      lost: t('Lost'),
      rediscovered: t('Rediscovered ruin'),
    };
    const out: Node[] = [kicker, title];
    const plate = c.pictures
      ? new Plate(
          this.data,
          {
            kind: 'city',
            id: c.id,
            pick: eraAt,
            label: d => formatYear(d.from ?? 0),
            range: eraRange,
            jump: d => this.store.set({year: d.from ?? 0, playing: false}),
          },
          vp,
          (d, title, caption, range) => this.openLightbox(d, title, caption, range),
        )
      : null;
    if (plate) out.push(plate.el);
    if (c.story) out.push(h('p.card-story', tx.story(c.id, c.story)));
    const labels: Record<string, string> = {
      founded: t('Founded'),
      peak: t('At its height'),
      abandoned: t('Abandoned'),
      forgotten: t('Forgotten'),
      rediscovered: t('Rediscovered'),
    };
    const dl = h('dl.dates');
    for (const k of ['founded', 'peak', 'abandoned', 'forgotten', 'rediscovered'] as const) {
      const d = c.dates[k];
      if (d === undefined) continue;
      const v = k === 'founded' && typeof d === 'number' && d < -2000 ? t('by {year}', {year: formatYear(d)}) : formatRange(d);
      dl.append(h('dt', labels[k]), h('dd', v));
    }
    out.push(h('h3.card-h', t('Dates')), dl);
    const names = c.names;
    if (names.length > 1) out.push(h('h3.card-h', t('Names over time')), namesList(this.data, names));
    if (c.journeys.length) out.push(h('h3.card-h', t('Journeys that stopped here')), this.journeyChips(c.journeys));
    if (c.region !== null) {
      const r = this.data.regions[c.region];
      out.push(h('p.card-part', t('In '), h('button.linkish', {type: 'button', onclick: () => this.actions.openRegion(r.id)}, tx.region(r.id, r.name))));
    }
    out.push(
      h('p.card-src', {title: this.data.sources[c.source]?.citation ?? c.source}, `${t('Source:')} ${shortCitation(this.data.sources, c.source)} · ${t('{level} confidence', {level: t(c.confidence)})}`),
    );
    this.live = st => {
      const status = cityStatus(c, st.year);
      swap(kicker, status, () => [statusText[status]]);
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

  /** The followed journey's sketch for the traveller's current stop, as the journey plays. */
  private scenes(j: Journey, s: State): Node[] {
    const vp = this.data.vp[j.viewpoint];
    const real = j.stops.filter(x => !x.waypoint);
    const stopLabel = (d: Depiction) => {
      const st = real[d.stop ?? 0];
      const k = d.stop ?? 0;
      return `${shortPlace(tx.stop(j.id, k, 'place', d.place ?? ''))} · ${st?.date ? tx.stop(j.id, k, 'date', st.date) : formatYear(st?.year ?? 0)}`;
    };
    const counter = h('span.scene-stop');
    const plate = new Plate(
      this.data,
      {
        kind: 'journey',
        id: j.id,
        pick: (items, at) => journeySceneAt(items, at),
        label: d => shortPlace(tx.stop(j.id, d.stop ?? 0, 'place', d.place ?? '')),
        range: stopLabel,
        jump: d => this.store.set({progress: d.stop ?? 0, playing: false}),
        shown: (d, at) => {
          const here = Math.floor(at + 1e-6) === d?.stop;
          counter.textContent = d ? t(here ? 'At stop {n} of {total}' : 'Last sketch at stop {n} of {total}', {n: (d.stop ?? 0) + 1, total: real.length}) : '';
        },
      },
      s.vps[0],
      (d, title, caption, range) => this.openLightbox(d, title, caption, range),
    );
    plate.el.classList.add('scene');
    this.scenePlate = plate;
    this.live = st => plate.show(st.progress);
    return [
      h('div.card-kicker', {style: `color:${vp.color}`}, h('span.kicker-icon', {html: kindIcons[j.kind] ?? ''}), t('From the sketchbook')),
      h('h2.card-title', tx.journey(j.id, 'name', j.name)),
      plate.el,
      h('p.scene-meta', counter),
    ];
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
        h('button.linkish', {type: 'button', title: t('Show on the map'), onclick: () => this.actions.flyTo(x.lon, x.lat, 4)}, tx.invention(x.id, 'place', x.place)),
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

function sceneStopAt(stops: number[], progress: number) {
  const k = Math.floor(progress + 1e-6);
  let best = stops[0];
  for (const x of stops) if (x <= k) best = x;
  return best;
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
    for (const n of [this.items[i + 1], this.items[i - 1]]) if (n) new Image().src = dataUrl(n.img.card);
  }

  private crossfade(d: Depiction, first: boolean) {
    this.ready = false;
    const token = ++this.token;
    const img = h('img.plate-layer', {src: dataUrl(d.img.card), alt: `${this.title(d)}, ${this.order.range(d)}: ${t('imagined sketch')}`, decoding: 'async'});
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
      h('dt', {style: vp === '*' ? '' : `color:${data.vp[vp as VpId].color}`}, vp === '*' ? 'Everyone' : data.vp[vp as VpId].name),
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
