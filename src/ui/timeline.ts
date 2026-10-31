import type {AppData} from '../data';
import type {JourneyGeo} from '../journey-geo';
import {stepCount} from '../journey-geo';
import {type Ribbon, ribbonLayout, ribbonProgress, ribbonX, ribbonXAtYear} from '../journey-ribbon';
import type {State, Store} from '../state';
import {deepScale, ERAS, formatYear, mainScale, type TimeScale, yearParts} from '../time';
import type {Moment, VpId} from '../types';
import {isZh, t, tx} from '../i18n';
import {h, setIcon} from './dom';
import {icons, inventionIcons, kindIcons} from './icons';

export const SPEEDS = [0.5, 1, 2, 4];
/** Slower paces used while a journey is under way during timeline playback. */
export const JOURNEY_SPEEDS = [0.02, 0.05, 0.1, 0.25];

const speedLabel = (x: number) => `${x < 0.1 ? String(x).replace(/^0/, '') : x}×`;

export function scaleFor(s: State): TimeScale {
  return s.vps.length === 1 && s.vps[0] === 'humanity' && !s.journey ? deepScale : mainScale;
}

export interface MomentRef extends Moment {
  vp: VpId;
}

export function momentsFor(data: AppData, s: State): MomentRef[] {
  const out: MomentRef[] = [];
  for (const vp of s.vps) {
    for (const m of data.vp[vp].moments) out.push({...m, vp});
    // A community marks the year each member joins with that member's own moment.
    for (const {viewpoint, from} of data.vp[vp].community?.members ?? []) {
      for (const m of data.vp[viewpoint].moments) if (m.year === from && !out.some(o => o.label === m.label)) out.push({...m, vp: viewpoint});
    }
  }
  return out.sort((a, b) => a.year - b.year);
}

/** The bottom bar: play, speed, the scrubbable track with key moments, and the year. */
export class Timeline {
  el: HTMLElement;
  private track: HTMLElement;
  private svgEl: SVGSVGElement;
  private handle: HTMLElement;
  private playBtn: HTMLButtonElement;
  private speedBtn: HTMLButtonElement;
  private allBtn: HTMLButtonElement;
  /** Set by the app each frame: playback is at journey pace because a journey is under way. */
  journeyPace = false;
  private yearNum: HTMLElement;
  private yearEra: HTMLElement;
  private caption: HTMLElement;
  private tip: HTMLElement;
  private scale: TimeScale = mainScale;
  private key = '';
  private moments: MomentRef[] = [];
  private captionTimer = 0;
  private geo: JourneyGeo | null = null;
  /** In journey mode, where each stop sits along the track. */
  private ribbon: Ribbon | null = null;
  /** The travelled part of the ribbon is drawn in full through this clip; the stops passed so far. */
  private doneClip: SVGRectElement | null = null;
  private stopBtns: HTMLElement[] = [];
  private passed = -1;
  private selected: string | null = null;
  /** The era the current year falls in, marked on the axis. */
  private eraKey = '';

  constructor(
    private data: AppData,
    private store: Store,
    onStep: (dir: -1 | 1) => void,
    private onInvention: (id: string) => void,
    private onEra: (id: string) => void,
    private onJourney: (id: string) => void,
  ) {
    this.playBtn = h('button.tl-play', {type: 'button', 'aria-label': t('Play'), onclick: () => store.set({playing: !store.state.playing})});
    this.speedBtn = h('button.tl-speed', {
      type: 'button',
      title: t('Playback speed'),
      onclick: () => {
        // While a journey is under way the button sets the journey pace; otherwise the normal speed.
        if (this.journeyPace) {
          const i = JOURNEY_SPEEDS.indexOf(store.state.journeySpeed);
          store.set({journeySpeed: JOURNEY_SPEEDS[(i + 1) % JOURNEY_SPEEDS.length]});
        } else {
          const i = SPEEDS.indexOf(store.state.speed);
          store.set({speed: SPEEDS[(i + 1) % SPEEDS.length]});
        }
      },
    });
    this.allBtn = h('button.tl-all', {
      type: 'button',
      title: t('Show every journey as the timeline plays'),
      'aria-label': t('Show every journey as the timeline plays'),
      html: icons.route,
      onclick: () => store.set({allJourneys: !store.state.allJourneys}),
    });
    this.svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svgEl.classList.add('tl-svg');
    this.handle = h('div.tl-handle', h('div.tl-handle-knob'));
    this.tip = h('div.tl-tip');
    this.track = h('div.tl-track', {role: 'slider', tabindex: '0', 'aria-label': t('Year')}, this.svgEl, this.handle, this.tip);
    this.yearNum = h('span.tl-year-num');
    this.yearEra = h('span.tl-year-era');
    this.caption = h('div.tl-caption');
    this.el = h(
      'footer.timeline.panel',
      h(
        'div.tl-controls',
        h('button.tl-step', {type: 'button', 'aria-label': t('Previous key moment'), title: t('Previous  ←'), onclick: () => onStep(-1), html: icons.prev}),
        this.playBtn,
        h('button.tl-step', {type: 'button', 'aria-label': t('Next key moment'), title: t('Next  →'), onclick: () => onStep(1), html: icons.next}),
        this.speedBtn,
        this.allBtn,
      ),
      this.track,
      h('div.tl-year', h('div.tl-year-line', this.yearNum, this.yearEra), this.caption),
    );
    this.bindTrack();
    new ResizeObserver(() => {
      this.key = '';
      this.update(this.store.state, this.geo);
    }).observe(this.track);
  }

  private bindTrack() {
    const fraction = (e: PointerEvent) => {
      const r = this.track.getBoundingClientRect();
      return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    };
    // In journey mode the track is a stop track: dragging moves the traveller along the route.
    const progressAt = (x: number) => (this.ribbon ? ribbonProgress(this.ribbon, x * this.ribbon.width) : 0);
    const patchAt = (x: number) => (this.geo ? {progress: progressAt(x)} : {year: this.scale.fromX(x)});
    const tipAt = (x: number) => {
      if (!this.geo) return formatYear(this.scale.fromX(x));
      const st = this.geo.stops[Math.min(this.geo.stops.length - 1, Math.round(progressAt(x)))];
      const k = this.geo.stops.indexOf(st);
      return `${tx.stop(this.geo.journey.id, k, 'place', st.stop.place ?? '')} · ${st.stop.date ? tx.stop(this.geo.journey.id, k, 'date', st.stop.date) : formatYear(st.year)}`;
    };
    let dragging = false;
    this.track.addEventListener('pointerdown', e => {
      if ((e.target as Element).closest('.tl-moment, .tl-invention, .tl-era')) return;
      dragging = true;
      this.track.setPointerCapture(e.pointerId);
      this.store.set({scrubbing: true, playing: false, ...patchAt(fraction(e))});
    });
    this.track.addEventListener('pointermove', e => {
      const r = this.track.getBoundingClientRect();
      const x = fraction(e);
      this.tip.textContent = tipAt(x);
      this.tip.style.left = `${x * r.width}px`;
      this.tip.classList.add('show');
      if (dragging) this.store.set(patchAt(x));
    });
    this.track.addEventListener('pointerleave', () => this.tip.classList.remove('show'));
    const end = () => {
      if (!dragging) return;
      dragging = false;
      this.store.set({scrubbing: false});
    };
    this.track.addEventListener('pointerup', end);
    this.track.addEventListener('pointercancel', end);
    this.track.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        const big = e.shiftKey ? 10 : 1;
        this.store.set({year: this.store.state.year + (e.key === 'ArrowLeft' ? -big : big)});
      }
    });
  }

  /** Show the effective speed: the journey pace (marked) while a journey is under way. */
  setPace(on: boolean, s: State = this.store.state) {
    this.journeyPace = on && s.allJourneys && !s.journey;
    this.speedBtn.textContent = speedLabel(this.journeyPace ? s.journeySpeed : s.speed);
    this.speedBtn.classList.toggle('journey-pace', this.journeyPace);
    this.speedBtn.title = t(this.journeyPace ? 'Journey pace: playback slows while a journey is under way' : 'Playback speed');
  }

  showCaption(text: string, color: string) {
    this.caption.textContent = text;
    this.caption.style.color = color;
    this.caption.classList.add('show');
    clearTimeout(this.captionTimer);
    this.captionTimer = window.setTimeout(() => this.caption.classList.remove('show'), 3800);
  }

  update(s: State, geo: JourneyGeo | null) {
    this.geo = geo;
    this.scale = scaleFor(s);
    const key = `${this.scale.kind}|${s.vps.join()}|${s.journey}|${this.track.clientWidth}`;
    if (key !== this.key) {
      this.key = key;
      this.moments = momentsFor(this.data, s);
      this.drawTrack(geo);
      this.selected = null;
    }
    const x = geo && this.ribbon ? ribbonX(this.ribbon, s.progress) / this.ribbon.width : this.scale.toX(s.year);
    this.handle.style.left = `${x * 100}%`;
    if (geo && this.ribbon) {
      this.doneClip?.setAttribute('width', String(x * this.ribbon.width));
      const passed = Math.floor(s.progress + 1e-6);
      if (passed !== this.passed) {
        this.passed = passed;
        this.stopBtns.forEach((b, i) => b.classList.toggle('ahead', i > passed));
      }
    }
    this.track.setAttribute('aria-valuenow', String(Math.round(s.year)));
    this.track.setAttribute('aria-valuetext', formatYear(s.year));
    const p = yearParts(s.year);
    this.yearNum.textContent = p.num;
    this.yearEra.textContent = p.era;
    // Chinese puts the era first: 公元前 325.
    if (p.pre && this.yearEra.nextSibling !== this.yearNum) this.yearEra.after(this.yearNum);
    if (!p.pre && this.yearNum.nextSibling !== this.yearEra) this.yearNum.after(this.yearEra);
    setIcon(this.playBtn, s.playing ? icons.pause : icons.play);
    this.playBtn.setAttribute('aria-label', t(s.playing ? 'Pause' : 'Play'));
    this.playBtn.classList.toggle('playing', s.playing);
    this.setPace(this.journeyPace, s);
    this.allBtn.hidden = !!s.journey;
    this.allBtn.classList.toggle('active', s.allJourneys);
    this.allBtn.setAttribute('aria-pressed', String(s.allJourneys));
    const era = this.geo ? '' : (ERAS.find(e => s.year >= e.from && s.year < e.to)?.id ?? '');
    if (era !== this.eraKey) {
      this.eraKey = era;
      for (const el of this.track.querySelectorAll<HTMLElement>('.tl-era')) el.classList.toggle('current', el.dataset.era === era);
    }
    if (s.invention !== this.selected) {
      this.selected = s.invention;
      for (const el of this.track.querySelectorAll<HTMLElement>('.tl-invention')) el.classList.toggle('selected', el.dataset.id === s.invention);
    }
  }

  private drawTrack(geo: JourneyGeo | null) {
    const W = this.track.clientWidth || 800;
    const H = 46;
    const svg = this.svgEl;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', String(W));
    svg.setAttribute('height', String(H));
    for (const el of this.track.querySelectorAll('.tl-moment, .tl-invention, .tl-era, .tl-fork')) el.remove();
    this.track.classList.toggle('journey', !!geo);
    this.stopBtns = [];
    this.passed = -1;
    if (geo) return this.drawRibbon(geo, W);
    this.ribbon = null;
    this.doneClip = null;
    const sc = this.scale;
    const parts: string[] = [];
    const base = 30;
    const X = (y: number) => sc.toX(y) * W;
    // The recent, crowded centuries get a light wash so the stretched scale reads as deliberate.
    if (sc.kind === 'main') {
      parts.push(`<rect x="${X(1800)}" y="${base - 22}" width="${X(2026) - X(1800)}" height="22" class="tl-wash"/>`);
    }
    // Hairlines between the eras, along the top edge above the markers.
    for (const era of ERAS.slice(1)) {
      const x = X(era.from);
      if (x > 0 && x < W) parts.push(`<line x1="${x}" x2="${x}" y1="1" y2="11" class="tl-era-rule"/>`);
    }
    parts.push(`<line x1="0" x2="${W}" y1="${base}" y2="${base}" class="tl-axis"/>`);
    // Labels never overlap: each must start past the previous one's right edge.
    let lastRight = -Infinity;
    const label = (x: number, text: string, cls = 'tl-label') => {
      // Chinese characters are about twice as wide as Latin ones.
      const w = [...text].reduce((a, ch) => a + (ch.charCodeAt(0) > 0x2e80 ? 12 : 6.1), 0);
      const anchor = x - w / 2 < 0 ? 'start' : x + w / 2 > W ? 'end' : 'middle';
      const left = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
      if (left < lastRight + 8) return;
      parts.push(`<text x="${x}" y="${base + 16}" text-anchor="${anchor}" class="${cls}">${text}</text>`);
      lastRight = left + w;
    };
    for (const t of sc.ticks()) {
      const x = X(t.year);
      parts.push(`<line x1="${x}" x2="${x}" y1="${base}" y2="${base + (t.major ? 6 : 3)}" class="tl-tick${t.major ? ' major' : ''}"/>`);
      if (t.label) label(x, t.label);
    }
    svg.innerHTML = parts.join('');

    // Era names, centred on their span; a narrow era (1800–1900) may spill past its edges, its neighbours easing
    // aside within their own spans to make room. A click opens that era in the list beside the map.
    {
      const marks = ERAS.map(era => {
        const a = Math.max(0, sc.toX(Math.max(era.from, -1e6))) * W;
        const b = Math.min(1, sc.toX(Math.min(era.to, 1e6))) * W;
        const name = t(era.name);
        const w = [...name].reduce((n, ch) => n + (ch.charCodeAt(0) > 0x2e80 ? 11 : 6.2), 0) + 10;
        return {era, name, a, b, w, x: (a + b) / 2};
      }).filter(m => m.b - m.a > 4);
      const gap = 10;
      // A name's centre stays within its own era, and the whole name within the track.
      const clamp = (m: (typeof marks)[number], x: number) => Math.max(m.a, m.w / 2, Math.min(m.b, W - m.w / 2, x));
      // Push names right past their left neighbours, then left away from their right neighbours, each name's
      // centre kept within its own era.
      for (let i = 1; i < marks.length; i++) {
        const p = marks[i - 1];
        marks[i].x = clamp(marks[i], Math.max(marks[i].x, p.x + p.w / 2 + gap + marks[i].w / 2));
      }
      for (let i = marks.length - 2; i >= 0; i--) {
        const n = marks[i + 1];
        marks[i].x = clamp(marks[i], Math.min(marks[i].x, n.x - n.w / 2 - gap - marks[i].w / 2));
      }
      let right = -Infinity;
      for (const m of marks) {
        const l = m.x - m.w / 2;
        if (l < right + gap - 1 || l < 0 || m.x + m.w / 2 > W) continue;
        right = m.x + m.w / 2;
        this.track.appendChild(
          h('button.tl-era', {
            type: 'button',
            style: `left:${(m.x / W) * 100}%`,
            'data-era': m.era.id,
            title: t('Show this era in the list'),
            onclick: (e: Event) => {
              e.stopPropagation();
              this.onEra(m.era.id);
            },
          }, m.name),
        );
      }
      this.eraKey = '';
    }
    // Inventions sit on the axis as small brass rings, under the viewpoint's own key moments.
    {
      for (const inv of this.data.inventions) {
        const x = sc.toX(inv.mid);
        if (x < 0 || x > 1) continue;
        this.track.appendChild(
          h('button.tl-invention', {
            type: 'button',
            style: `left:${x * 100}%`,
            title: `${formatYear(inv.mid)} · ${tx.invention(inv.id, 'name', inv.name)}`,
            'aria-label': `${t('Invention')}, ${formatYear(inv.mid)}: ${tx.invention(inv.id, 'name', inv.name)}`,
            'data-id': inv.id,
            html: inventionIcons[inv.category] ?? icons.invention,
            onclick: (e: Event) => {
              e.stopPropagation();
              this.onInvention(inv.id);
            },
          }),
        );
      }
    }
    for (const m of this.moments) {
      const x = Math.max(0, Math.min(1, sc.toX(m.year)));
      const label = tx.moment(m.label);
      const color = this.data.vp[m.vp].color;
      this.track.appendChild(
        h('button.tl-moment', {
          type: 'button',
          style: `left:${x * 100}%;--m:${color}`,
          title: `${formatYear(m.year)} · ${label}`,
          'aria-label': `${formatYear(m.year)}: ${label}`,
          onclick: (e: Event) => {
            e.stopPropagation();
            this.store.set({year: m.year, playing: false});
            this.showCaption(label, color);
          },
        }),
      );
    }
  }

  /**
   * A journey's own timeline: the route as a ribbon, land legs in the journey's colour and sea legs doubled, long
   * stays folded into breaks marked with their length, parties sent out hanging from where they set out, and the
   * line running on to the news reaching home. Place names sit above, years below.
   */
  private drawRibbon(geo: JourneyGeo, W: number) {
    const j = geo.journey;
    const n = geo.stops.length;
    const times = geo.stops.map(st => st.t);
    const rb = ribbonLayout(times, W, geo.epilogue);
    this.ribbon = rb;
    const color = this.data.vp[j.viewpoint].color;
    const xs = rb.xs;
    const Y = 20;
    const parts: string[] = [];
    // Labels never overlap: each row keeps the spans already taken.
    const rows: Record<string, [number, number][]> = {top: [], bottom: []};
    const fits = (row: string, l: number, r: number) => l >= -0.5 && r <= W + 0.5 && rows[row].every(([a, b]) => r + 8 <= a || l >= b + 8);
    const label = (row: 'top' | 'bottom', x: number, text: string, cls: string, title = '') => {
      // Chinese characters are about twice as wide as Latin ones.
      const w = [...text].reduce((a, ch) => a + (ch.charCodeAt(0) > 0x2e80 ? 12 : 6.1), 0);
      const anchor = x - w / 2 < 0 ? 'start' : x + w / 2 > W ? 'end' : 'middle';
      const l = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
      if (!fits(row, l, l + w)) return false;
      rows[row].push([l, l + w]);
      parts.push(`<text x="${x}" y="${row === 'top' ? 9 : 40}" text-anchor="${anchor}" class="${cls}">${title ? `<title>${esc(title)}</title>` : ''}${esc(text)}</text>`);
      return true;
    };
    const place = (i: number) => tx.stop(j.id, i, 'place', geo.stops[i].stop.place ?? '');

    // The legs, by how they were travelled. Drawn twice: faded for the way ahead, and in full through a clip
    // that grows with the traveller.
    const folded = new Set(rb.folds.map(f => f.after + 1));
    const legs: string[] = [];
    for (let i = 1; i < n; i++) {
      if (folded.has(i)) continue;
      // As routed: a leg the router left off the map (to orbit, to the Moon) is drawn as a flight.
      const mode = j.modes?.[i] ?? (j.route[i] ? 'land' : 'direct');
      const by = mode === 'mixed' ? 'land' : mode;
      const [a, b] = [xs[i - 1], xs[i]];
      if (by === 'sea') legs.push(`<path d="M${a} ${Y - 2}H${b}M${a} ${Y + 2}H${b}" class="tl-leg sea"/>`);
      else legs.push(`<path d="M${a} ${Y}H${b}" class="tl-leg ${by === 'land' ? 'land' : by}"/>`);
    }
    parts.push(`<defs><clipPath id="tl-done"><rect x="-8" y="0" width="0" height="46"/></clipPath></defs>`);
    parts.push(`<g class="tl-ribbon ahead">${legs.join('')}</g><g class="tl-ribbon" clip-path="url(#tl-done)">${legs.join('')}</g>`);

    // Folds: a broken stretch, and how long it was.
    for (const f of rb.folds) {
      const m = (f.x0 + f.x1) / 2;
      parts.push(`<path d="M${f.x0 + 7} ${Y}H${f.x1 - 7}" class="tl-fold"/>`);
      parts.push(`<path d="M${f.x0 + 6} ${Y - 5}l-4 10M${f.x1 - 2} ${Y - 5}l-4 10" class="tl-fold-mark"/>`);
      label('bottom', m, yearsText(f.years), 'tl-label fold', t('{n} between {a} and {b}', {n: yearsText(f.years), a: shortPlace(place(f.after)), b: shortPlace(place(f.after + 1))}));
    }
    // The news on its way home.
    if (rb.home) {
      parts.push(`<path d="M${rb.home.x0 + 5} ${Y}H${rb.home.x1 - 6}" class="tl-home-line"/>`);
      label('top', W, t('The news reaches home'), 'tl-label home');
      label('bottom', W, formatYear(geo.homeKnows), 'tl-label home');
    }
    // Parties sent out from this journey, at the year they set out: on the line during a long stay, else above it.
    for (const c of this.data.journeyChildren.get(j.id) ?? []) {
      const at = ribbonXAtYear(rb, times, geo.epilogue ? geo.homeKnows : null, c.t[0]);
      if (at === null) continue;
      const name = tx.journey(c.id, 'name', c.name);
      // Within a fold time isn't to scale, so a party setting out during a long stay hangs from its middle.
      const fold = rb.folds.find(f => at > f.x0 && at < f.x1);
      const x = fold ? (fold.x0 + fold.x1) / 2 : at;
      const inFold = !!fold;
      if (!inFold) {
        rows.top.push([x - 9, x + 9]);
        parts.push(`<path d="M${x} ${13}V${Y - 3}" class="tl-fork-stem"/>`);
      }
      this.track.appendChild(
        h('button.tl-fork', {
          type: 'button',
          class: inFold ? 'on-line' : '',
          style: `left:${(x / W) * 100}%`,
          title: `${t('{name} sets out from here', {name})} · ${formatYear(c.t[0])}`,
          'aria-label': t('Follow {name}', {name}),
          html: kindIcons[c.kind] ?? kindIcons.traveler,
          onclick: (e: Event) => {
            e.stopPropagation();
            this.onJourney(c.id);
          },
        }),
      );
    }
    // Place names above: where it starts and ends and where each fold begins and ends, then any others with room.
    const order = [0, n - 1, ...rb.folds.map(f => f.after), ...rb.folds.map(f => f.after + 1), ...geo.stops.map((_, i) => i)];
    const done = new Set<number>();
    for (const i of order) {
      if (done.has(i)) continue;
      done.add(i);
      label('top', xs[i], shortPlace(place(i)), 'tl-label place');
    }
    // Years below, wherever the year turns.
    let lastYear = NaN;
    geo.stops.forEach((st, i) => {
      const y = Math.round(st.year);
      if (y !== lastYear) label('bottom', xs[i], formatYear(y), 'tl-label');
      lastYear = y;
    });
    this.svgEl.innerHTML = parts.join('');
    this.svgEl.style.setProperty('--j', color);
    this.doneClip = this.svgEl.querySelector('#tl-done rect');

    const steps = stepCount(geo);
    for (let i = 0; i < steps; i++) {
      const home = i >= n;
      const text = home ? t('The news reaches home') : place(i);
      const year = home ? geo.homeKnows : geo.stops[i].year;
      // Where stops crowd together they shrink, so a busy stretch reads as a line rather than a string of beads.
      const room = Math.min(i > 0 ? xs[i] - xs[i - 1] : Infinity, i < steps - 1 ? xs[i + 1] - xs[i] : Infinity);
      const b = h('button.tl-moment.stop', {
        type: 'button',
        class: home ? 'home' : room < 11 ? 'small' : '',
        style: `left:${(xs[i] / W) * 100}%;--m:${color}`,
        title: `${formatYear(year)} · ${text}`,
        'aria-label': `${formatYear(year)}: ${text}`,
        onclick: (e: Event) => {
          e.stopPropagation();
          this.store.set({progress: i, playing: false});
          this.showCaption(text, color);
        },
      });
      this.stopBtns.push(b);
      this.track.appendChild(b);
    }
  }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A place name without its gloss: "Tauris (Tabriz)" is Tauris on a crowded line; the tooltip has the rest. */
const shortPlace = (s: string) => s.replace(/\s*[（(][^（()）]*[)）]\s*$/, '') || s;

/** How long a fold is (never under a year and a half), to the half year: "6 years", "2½ years". */
function yearsText(years: number): string {
  const half = Math.round(years * 2) / 2;
  const whole = Math.floor(half);
  return t('{n} years', {n: half % 1 ? (isZh() ? `${whole}.5` : `${whole}½`) : String(whole)});
}
