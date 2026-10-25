import type {AppData} from '../data';
import {dataUrl, loadPictures, nameFor, shortCitation} from '../data';
import type {FogField} from '../fog/field';
import {cityStatus} from '../map/overlay';
import type {State, Store} from '../state';
import {formatRange, formatYear, mainScale} from '../time';
import type {City, Depiction, DepictionDoc, Invention, NameEntry, Region, RegionEvent, VpId} from '../types';
import {ALL_VPS, CONFIDENCE_NAMES, HUMANITY_LEVEL_NAMES, LEVEL_NAMES} from '../types';
import {h} from './dom';
import {icons, inventionIcons, kindIcons} from './icons';

const LEVEL_ALPHA = [0, 0.16, 0.32, 0.52, 0.74, 0.94];

export function levelName(vp: VpId, level: number) {
  return (vp === 'humanity' ? HUMANITY_LEVEL_NAMES : LEVEL_NAMES)[level] ?? '';
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
  private lightbox: HTMLElement | null = null;

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
      h('button.card-close', {type: 'button', 'aria-label': 'Close', onclick: () => store.set({region: null, regionCell: null, city: null, invention: null}), html: icons.close}),
    );
    this.el.hidden = true;
    // Once scrolled, the text fades out under the top edge and the close button gets a backing.
    this.scroller.addEventListener('scroll', () => this.el.classList.toggle('scrolled', this.scroller.scrollTop > 4), {passive: true});
  }

  update(s: State) {
    const subject = s.invention ? `invention:${s.invention}` : s.city ? `city:${s.city}` : s.region ? `region:${s.region}:${s.regionCell}` : '';
    this.el.hidden = !subject;
    if (!subject) {
      this.key = '';
      this.live = null;
      return;
    }
    const key = `${subject}|${s.vps.join()}`;
    if (key !== this.key) {
      const sameSubject = this.key.split('|')[0] === subject;
      this.key = key;
      this.live = null;
      let nodes: Node[] = [];
      if (s.invention) {
        const x = this.data.inventionById.get(s.invention);
        if (x) nodes = this.invention(x);
      } else if (s.city) {
        const c = this.data.cityById.get(s.city);
        if (c) nodes = this.city(c, s);
      } else if (s.region) {
        const r = this.data.regionById.get(s.region);
        if (r) nodes = this.region(r, s);
      }
      this.body.replaceChildren(...nodes);
      // A new subject starts at the top; a new viewpoint on the same one keeps the reader's place.
      if (!sameSubject) {
        this.scroller.scrollTop = 0;
        this.el.classList.remove('scrolled');
      }
      this.body.classList.remove('card-enter');
      void this.body.offsetWidth;
      this.body.classList.add('card-enter');
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
      h('div.card-kicker', r.surface === 'sea' ? 'Sea' : r.body ? 'Beyond Earth' : 'Region'),
      h('h2.card-title', r.name),
      called,
      h('div.card-status', swatch, h('span', level, vpData.special ? '' : ` to ${vpData.name}`, ' in ', year), conf),
    ];
    let ribbons: SVGElement | null = null;
    if (cell >= 0) out.push(h('h3.card-h', 'Who knew it, and when'), (ribbons = this.ribbons(cell)));
    const names = r.names.filter(n => n.vp !== '*');
    if (names.length) out.push(h('h3.card-h', 'What they called it'), namesList(this.data, names));
    const evs = this.events(r, vp);
    if (evs.length) out.push(h('h3.card-h', `How ${vpData.special ? 'people' : vpData.name} came to know it`), h('ol.events', evs));
    if (vp === 'polynesia') {
      out.push(
        h('p.card-note', 'Polynesian knowledge was carried in navigation lore and oral tradition. These dates come from archaeology and genetics and carry wide ranges.'),
      );
    }
    if (r.journeys.length) out.push(h('h3.card-h', 'Journeys that passed through'), this.journeyChips(r.journeys));
    const parents = r.parents.map(id => this.data.regionById.get(id)).filter(Boolean) as Region[];
    if (parents.length) {
      out.push(
        h(
          'p.card-part',
          'Part of ',
          parents.map((p, i) => [i ? ' and ' : '', h('button.linkish', {type: 'button', onclick: () => this.actions.openRegion(p.id)}, p.name)]),
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
        swap(called, `${name.name}|${name.native ?? ''}`, () => [
          'Called ',
          h('em', name.name),
          name.native ? h('span.native', ` ${name.native}`) : null,
          ` by ${vpData.special ? 'people' : vpData.name} in `,
          calledYear,
        ]);
      }
      calledYear.textContent = formatYear(y);
      const state = cell >= 0 ? this.field.cellState(vp, cell, y) : {level: 0, conf: 0};
      swatch.style.setProperty('--a', String(fogAlphaFor(state.level)));
      swap(level, String(state.level), () => [levelName(vp, state.level)]);
      year.textContent = formatYear(y);
      conf.hidden = state.level === 0;
      swap(conf, String(state.conf), () => [`${CONFIDENCE_NAMES[state.conf]} confidence`]);
      if (now) {
        const x = ribbonX(Math.max(-500, y));
        now.setAttribute('x1', String(x));
        now.setAttribute('x2', String(x));
      }
    };
    return out;
  }

  private events(r: Region, vp: VpId): Node[] {
    const rows: {e: RegionEvent; shared: boolean}[] = [];
    for (const e of r.events[vp] ?? []) rows.push({e, shared: false});
    if (vp !== 'humanity') for (const e of r.events['*'] ?? []) rows.push({e, shared: true});
    const y = (e: RegionEvent) => (typeof e.y === 'number' ? e.y : (e.y[0] + e.y[1]) / 2);
    rows.sort((a, b) => y(a.e) - y(b.e));
    return rows.map(({e, shared}) => {
      const j = e.journey ? this.data.journeyById.get(e.journey) : null;
      return h(
        'li.event',
        h('span.event-year', formatRange(e.y)),
        h(
          'div.event-body',
          h('div.event-level', h('span.level-dot', {style: `--a:${LEVEL_ALPHA[e.level]}`}), e.cap ? `held at ${levelName(vp, e.level).toLowerCase()}` : levelName(vp, e.level), shared ? h('span.shared', ' · shared modern map') : null),
          e.note ? h('div.event-note', e.note) : null,
          j ? h('button.linkish.event-journey', {type: 'button', onclick: () => this.actions.openJourney(j.id)}, j.name) : null,
          h('div.event-src', {title: this.data.sources[e.source]?.citation ?? e.source}, shortCitation(this.data.sources, e.source), ` · ${CONFIDENCE_NAMES[e.conf]}`),
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
      parts.push(`<text x="0" y="${y0 + 10}" class="rb-label">${vpd.name}</text>`);
      parts.push(`<line x1="${L}" x2="${W - 4}" y1="${y0 + 6}" y2="${y0 + 6}" class="rb-base"/>`);
      for (let k = 0; k < hist.length; k++) {
        const [yy, lvl] = hist[k];
        if (lvl === 0) continue;
        const end = k + 1 < hist.length ? hist[k + 1][0] : 2026;
        const a = X(Math.max(-500, yy));
        const b = X(end);
        if (b <= a) continue;
        parts.push(`<rect x="${a}" y="${y0}" width="${b - a}" height="12" rx="1.5" fill="${vpd.color}" fill-opacity="${LEVEL_ALPHA[lvl]}"/>`);
      }
      const first = hist.find(([, l]) => l > 0);
      if (first) {
        const t = first[0] < -500 ? `since ${formatYear(first[0])}` : `first known ${formatYear(first[0])}`;
        parts.push(`<title>${vpd.name}: ${t}</title>`);
      }
    });
    parts.push(`<line x1="${L}" x2="${L}" y1="0" y2="${H - 14}" class="rb-now"/>`);
    for (const [y, label] of [
      [-500, '500 BCE'],
      [1000, '1000'],
      [1500, '1500'],
      [1900, '1900'],
    ] as [number, string][]) {
      parts.push(`<text x="${X(y)}" y="${H - 2}" class="rb-axis" text-anchor="${y === -500 ? 'start' : 'middle'}">${label}</text>`);
    }
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    el.setAttribute('viewBox', `0 0 ${W} ${H}`);
    el.setAttribute('class', 'ribbons');
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', 'When each viewpoint knew this place');
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
          j.name,
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
      unborn: 'Not yet founded',
      living: c.tier === 1 ? 'Great city' : c.tier === 2 ? 'City' : 'Town',
      ruin: 'Ruin',
      lost: 'Lost',
      rediscovered: 'Rediscovered ruin',
    };
    const out: Node[] = [kicker, title];
    const plate = c.pictures ? new Plate(this.data, this.store, c, vp, (d, caption) => this.openLightbox(d, caption)) : null;
    if (plate) out.push(plate.el);
    if (c.story) out.push(h('p.card-story', c.story));
    const labels: Record<string, string> = {
      founded: 'Founded',
      peak: 'At its height',
      abandoned: 'Abandoned',
      forgotten: 'Forgotten',
      rediscovered: 'Rediscovered',
    };
    const dl = h('dl.dates');
    for (const k of ['founded', 'peak', 'abandoned', 'forgotten', 'rediscovered'] as const) {
      const d = c.dates[k];
      if (d === undefined) continue;
      const v = k === 'founded' && typeof d === 'number' && d < -2000 ? `by ${formatYear(d)}` : formatRange(d);
      dl.append(h('dt', labels[k]), h('dd', v));
    }
    out.push(h('h3.card-h', 'Dates'), dl);
    const names = c.names;
    if (names.length > 1) out.push(h('h3.card-h', 'Names over time'), namesList(this.data, names));
    if (c.journeys.length) out.push(h('h3.card-h', 'Journeys that stopped here'), this.journeyChips(c.journeys));
    if (c.region !== null) {
      const r = this.data.regions[c.region];
      out.push(h('p.card-part', 'In ', h('button.linkish', {type: 'button', onclick: () => this.actions.openRegion(r.id)}, r.name)));
    }
    out.push(
      h('p.card-src', {title: this.data.sources[c.source]?.citation ?? c.source}, `Source: ${shortCitation(this.data.sources, c.source)} · ${c.confidence} confidence`),
    );
    this.live = st => {
      const status = cityStatus(c, st.year);
      swap(kicker, status, () => [statusText[status]]);
      const name = nameFor(c.names, vp, st.year, c.id)!;
      swap(title, `${name.name}|${name.native ?? ''}`, () => [name.name, name.native && name.native !== name.name ? h('span.native', ` ${name.native}`) : null]);
      plate?.show(st.year);
    };
    return out;
  }

  private openLightbox(d: Depiction, caption: string) {
    this.lightbox?.remove();
    const range = eraRange(d);
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
      {role: 'dialog', 'aria-modal': 'true', 'aria-label': d.title, onclick: (e: Event) => e.target === box && close()},
      h(
        'figure.lightbox-plate',
        h('img', {src: dataUrl(d.img.full), alt: `${d.title}, ${range}: imagined sketch`}),
        h(
          'figcaption',
          h('div.lightbox-head', h('span.plate-era', d.title), h('span.plate-range', range), d.placeholder ? h('span.plate-tag.inline', 'Placeholder') : null),
          h('p', caption),
        ),
        h('button.card-close', {type: 'button', 'aria-label': 'Close', onclick: close, html: icons.close}),
      ),
    );
    document.addEventListener('keydown', onKey, true);
    document.body.append(box);
    this.lightbox = box;
  }

  // ── Invention ────────────────────────────────────────────────────────────

  private invention(x: Invention): Node[] {
    const CATEGORY: Record<string, string> = {
      navigation: 'Finding the way',
      measurement: 'Measuring the world',
      mapping: 'Drawing the map',
      communication: 'Carrying the news',
      transport: 'Going further',
      imaging: 'Seeing from afar',
    };
    const vp = x.vp ? this.data.vp[x.vp] : null;
    const all = this.data.inventions;
    const i = all.indexOf(x);
    const nav = (other: Invention | undefined, dir: string) =>
      other
        ? h(
            'button.inv-nav-btn',
            {type: 'button', title: other.name, onclick: () => this.actions.openInvention(other.id)},
            dir === 'prev' ? h('span', {html: icons.prev}) : null,
            h('span.inv-nav-text', h('span.inv-nav-when', formatRange(other.year)), h('span.inv-nav-name', other.name)),
            dir === 'next' ? h('span', {html: icons.next}) : null,
          )
        : h('span');
    return [
      h('div.card-kicker.inv-kicker', h('span.kicker-icon', {html: inventionIcons[x.category] ?? icons.invention}), `Invention · ${CATEGORY[x.category] ?? x.category}`),
      h('h2.card-title', x.name, x.native ? h('span.native', ` ${x.native}`) : null),
      h(
        'p.inv-meta',
        h('strong', formatRange(x.year)),
        ' · ',
        h('button.linkish', {type: 'button', title: 'Show on the map', onclick: () => this.actions.flyTo(x.lon, x.lat, 4)}, x.place),
        ' · ',
        vp ? h('span', {style: `color:${vp.color}`}, vp.longName) : x.culture ?? '',
      ),
      h('p.card-story', x.summary),
      h('h3.card-h', 'What it changed'),
      h('p.inv-changed', x.changed),
      h('p.card-src', {title: this.data.sources[x.source]?.citation ?? x.source}, `Source: ${shortCitation(this.data.sources, x.source)} · ${x.confidence} confidence`),
      h('div.inv-nav', nav(all[i - 1], 'prev'), nav(all[i + 1], 'next')),
    ];
  }
}

const RIBBON = {W: 320, L: 74, row: 17};
const ribbonX = (y: number) => RIBBON.L + mainScale.toX(y) * (RIBBON.W - RIBBON.L - 4);

function eraRange(d: Depiction) {
  return `${formatYear(d.from)} – ${d.to === undefined ? 'today' : formatYear(d.to)}`;
}

function eraAt(eras: Depiction[], year: number): Depiction | null {
  for (let i = eras.length - 1; i >= 0; i--) {
    const e = eras[i];
    if (year >= e.from && (e.to === undefined || year < e.to + 1)) return e;
  }
  return null;
}

/**
 * A city's picture for the current era. The pictures load when the card opens; when the era changes the
 * new sketch cross-fades over the old one once it has decoded, and the caption fades with it.
 */
class Plate {
  el: HTMLElement;
  private frame: HTMLElement;
  private cap: HTMLElement;
  private text: HTMLElement;
  private src: HTMLElement;
  private strip: HTMLElement;
  private doc: DepictionDoc | null = null;
  private shown: Depiction | null = null;
  private year = NaN;
  private token = 0;

  constructor(
    private data: AppData,
    private store: Store,
    city: City,
    private vp: VpId,
    private enlarge: (d: Depiction, caption: string) => void,
  ) {
    this.frame = h('button.plate-img', {
      type: 'button',
      title: 'Enlarge',
      onclick: () => this.shown && this.enlarge(this.shown, this.caption(this.shown)),
    });
    this.cap = h('figcaption.plate-cap');
    this.text = h('p.plate-text');
    this.strip = h('div.plate-eras', {role: 'group', 'aria-label': 'Other eras'});
    this.src = h('p.plate-src');
    this.el = h('figure.plate.loading', this.frame, this.cap, this.text, this.strip, this.src);
    loadPictures(data, 'city', city.id).then(doc => {
      if (!doc) {
        this.el.remove();
        return;
      }
      this.doc = doc;
      this.el.classList.remove('loading');
      this.strip.hidden = doc.eras.length < 2;
      this.strip.replaceChildren(
        ...doc.eras.map(x =>
          h(
            'button.plate-era-btn',
            {type: 'button', 'data-id': x.id, title: `${x.title} (${formatYear(x.from)})`, onclick: () => this.store.set({year: x.from, playing: false})},
            h('img', {src: dataUrl(x.img.thumb), alt: '', decoding: 'async'}),
            h('span', formatYear(x.from)),
          ),
        ),
      );
      if (Number.isFinite(this.year)) this.show(this.year);
    });
  }

  private caption(d: Depiction) {
    return d.captions?.[this.vp] ?? d.caption;
  }

  show(year: number) {
    this.year = year;
    if (!this.doc) return;
    const d = eraAt(this.doc.eras, year);
    this.el.hidden = !d;
    if (!d || d === this.shown) return;
    const first = !this.shown;
    this.shown = d;
    const range = eraRange(d);
    const caption = this.caption(d);
    this.frame.setAttribute('aria-label', `Enlarge: ${d.title}`);
    swap(this.cap, d.id, () => [h('span.plate-era', d.title), h('span.plate-range', range)]);
    swap(this.text, `${d.id}|${this.vp}`, () => [caption]);
    swap(this.src, d.id, () => [
      `Imagined sketch${d.made?.model ? ` (${d.made.model})` : ''} · after ${d.sources.map(id => shortCitation(this.data.sources, id)).join(', ')}`,
    ]);
    this.src.title = d.sources.map(id => this.data.sources[id]?.citation ?? id).join('\n');
    for (const b of this.strip.querySelectorAll<HTMLElement>('.plate-era-btn')) {
      const on = b.dataset.id === d.id;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    }
    this.crossfade(d, first);
    // Warm the neighbours so playing on into the next era doesn't wait for the network.
    const i = this.doc.eras.indexOf(d);
    for (const n of [this.doc.eras[i + 1], this.doc.eras[i - 1]]) if (n) new Image().src = dataUrl(n.img.card);
  }

  private crossfade(d: Depiction, first: boolean) {
    const token = ++this.token;
    const img = h('img.plate-layer', {src: dataUrl(d.img.card), alt: `${d.title}, ${eraRange(d)}: imagined sketch`, decoding: 'async'});
    const tag = d.placeholder ? h('span.plate-tag', 'Placeholder') : null;
    const reveal = () => {
      if (token !== this.token) return;
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
      requestAnimationFrame(() => img.classList.add('in'));
      const done = () => under.remove();
      img.addEventListener('transitionend', done, {once: true});
      setTimeout(done, 1600);
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
