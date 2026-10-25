import type {AppData} from '../data';
import {dataUrl, nameFor, shortCitation} from '../data';
import type {FogField} from '../fog/field';
import {cityStatus} from '../map/overlay';
import type {State, Store} from '../state';
import {formatRange, formatYear, mainScale} from '../time';
import type {City, Depiction, Invention, NameEntry, Region, RegionEvent, VpId} from '../types';
import {ALL_VPS, CONFIDENCE_NAMES, HUMANITY_LEVEL_NAMES, LEVEL_NAMES} from '../types';
import {h} from './dom';
import {icons, inventionIcons, kindIcons} from './icons';

const LEVEL_ALPHA = [0, 0.16, 0.32, 0.52, 0.74, 0.94];

export function levelName(vp: VpId, level: number) {
  return (vp === 'humanity' ? HUMANITY_LEVEL_NAMES : LEVEL_NAMES)[level] ?? '';
}

export class Cards {
  el: HTMLElement;
  private body: HTMLElement;
  private key = '';
  /** The picture plate is kept between redraws so playing through an era doesn't reload the image. */
  private plateEl: HTMLElement | null = null;
  private plateKey = '';
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
    this.el = h(
      'aside.card.panel',
      {'aria-live': 'polite'},
      h('button.card-close', {type: 'button', 'aria-label': 'Close', onclick: () => store.set({region: null, regionCell: null, city: null, invention: null}), html: icons.close}),
      this.body,
    );
    this.el.hidden = true;
  }

  update(s: State) {
    const year = Math.round(s.year);
    const key = `${s.city}|${s.region}|${s.regionCell}|${s.invention}|${s.vps.join()}|${s.invention ? '' : year}`;
    if (key === this.key) return;
    this.key = key;
    this.el.hidden = !s.city && !s.region && !s.invention;
    if (!s.city) {
      this.plateEl = null;
      this.plateKey = '';
    }
    if (this.el.hidden) return;
    this.body.replaceChildren();
    if (s.invention) {
      const x = this.data.inventionById.get(s.invention);
      if (x) this.body.append(...this.invention(x));
    } else if (s.city) {
      const c = this.data.cityById.get(s.city);
      if (c) this.body.append(...this.city(c, s));
    } else if (s.region) {
      const r = this.data.regionById.get(s.region);
      if (r) this.body.append(...this.region(r, s));
    }
    this.el.scrollTop = 0;
  }

  // ── Region ───────────────────────────────────────────────────────────────

  private region(r: Region, s: State): Node[] {
    const vp = s.vps[0];
    const year = s.year;
    const cell = s.regionCell ?? -1;
    const st = cell >= 0 ? this.field.cellState(vp, cell, year) : {level: 0, conf: 0};
    const called = r.names.find(n => n.vp === vp && (n.from === undefined || year >= n.from) && (n.to === undefined || year <= n.to));
    const vpData = this.data.vp[vp];
    const out: Node[] = [
      h('div.card-kicker', r.surface === 'sea' ? 'Sea' : r.body ? 'Beyond Earth' : 'Region'),
      h('h2.card-title', r.name),
    ];
    if (called) {
      out.push(
        h(
          'p.card-called',
          'Called ',
          h('em', called.name),
          called.native ? h('span.native', ` ${called.native}`) : null,
          ` by ${vpData.special ? 'people' : vpData.name} in ${formatYear(year)}`,
        ),
      );
    }
    out.push(
      h(
        'div.card-status',
        h('span.fog-swatch', {style: `--a:${fogAlphaFor(st.level)}`}),
        h('span', h('strong', levelName(vp, st.level)), vpData.special ? '' : ` to ${vpData.name}`, ` in ${formatYear(year)}`),
        st.level > 0 ? h('span.conf', `${CONFIDENCE_NAMES[st.conf]} confidence`) : null,
      ),
    );
    if (cell >= 0) out.push(h('h3.card-h', 'Who knew it, and when'), this.ribbons(cell, year));
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

  private ribbons(cell: number, year: number): SVGElement {
    const W = 320;
    const L = 74;
    const row = 17;
    const H = ALL_VPS.length * row + 18;
    const X = (y: number) => L + mainScale.toX(y) * (W - L - 4);
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
    const cx = X(Math.max(-500, year));
    parts.push(`<line x1="${cx}" x2="${cx}" y1="0" y2="${H - 14}" class="rb-now"/>`);
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
    const year = s.year;
    const name = nameFor(c.names, vp, year, c.id)!;
    const status = cityStatus(c, year);
    const statusText: Record<string, string> = {
      unborn: 'Not yet founded',
      living: c.tier === 1 ? 'Great city' : c.tier === 2 ? 'City' : 'Town',
      ruin: 'Ruin',
      lost: 'Lost',
      rediscovered: 'Rediscovered ruin',
    };
    const out: Node[] = [
      h('div.card-kicker', statusText[status]),
      h('h2.card-title', name.name, name.native && name.native !== name.name ? h('span.native', ` ${name.native}`) : null),
    ];
    const plate = this.plate(c, s);
    if (plate) out.push(plate);
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
    return out;
  }

  // ── Pictures ─────────────────────────────────────────────────────────────

  /** The sketch for the current era, its caption as the current viewpoint saw it, and the other eras. */
  private plate(c: City, s: State): HTMLElement | null {
    const all = c.depictions;
    if (!all?.length) return null;
    const vp = s.vps[0];
    const d = [...all].reverse().find(x => s.year >= x.from && (x.to === undefined || s.year <= x.to + 0.999));
    if (!d) return null;
    const key = `${c.id}|${d.id}|${vp}`;
    if (key === this.plateKey && this.plateEl) return this.plateEl;
    const fresh = this.plateKey.startsWith(`${c.id}|`);
    this.plateKey = key;
    const caption = d.captions?.[vp] ?? d.caption;
    const range = `${formatYear(d.from)} – ${d.to === undefined ? 'today' : formatYear(d.to)}`;
    const el = h(
      'figure.plate',
      {class: fresh ? 'plate-enter' : ''},
      h(
        'button.plate-img',
        {type: 'button', title: 'Enlarge', 'aria-label': `Enlarge: ${d.title}`, onclick: () => this.openLightbox(d, caption, range)},
        h('img', {src: dataUrl(d.image), alt: `${d.title}, ${range}: imagined sketch`, decoding: 'async'}),
        d.placeholder ? h('span.plate-tag', 'Placeholder') : null,
      ),
      h('figcaption.plate-cap', h('span.plate-era', d.title), h('span.plate-range', range)),
      h('p.plate-text', caption),
      all.length > 1
        ? h(
            'div.plate-eras',
            {role: 'group', 'aria-label': 'Other eras'},
            all.map(x =>
              h(
                'button.plate-era-btn',
                {
                  type: 'button',
                  class: x === d ? 'active' : '',
                  'aria-pressed': String(x === d),
                  title: `${x.title} (${formatYear(x.from)})`,
                  onclick: () => this.store.set({year: x.from, playing: false}),
                },
                h('img', {src: dataUrl(x.image), alt: '', loading: 'lazy', decoding: 'async'}),
                h('span', formatYear(x.from)),
              ),
            ),
          )
        : null,
      h(
        'p.plate-src',
        {title: d.sources.map(id => this.data.sources[id]?.citation ?? id).join('\n')},
        `Imagined sketch${d.made?.model ? ` (${d.made.model})` : ''} · after ${d.sources.map(id => shortCitation(this.data.sources, id)).join(', ')}`,
      ),
    );
    this.plateEl = el;
    return el;
  }

  private openLightbox(d: Depiction, caption: string, range: string) {
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
      {role: 'dialog', 'aria-modal': 'true', 'aria-label': d.title, onclick: (e: Event) => e.target === box && close()},
      h(
        'figure.lightbox-plate',
        h('img', {src: dataUrl(d.image), alt: `${d.title}, ${range}: imagined sketch`}),
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
