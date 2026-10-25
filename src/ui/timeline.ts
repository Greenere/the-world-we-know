import type {AppData} from '../data';
import type {JourneyGeo} from '../journey-geo';
import {stepCount} from '../journey-geo';
import type {State, Store} from '../state';
import {deepScale, formatYear, mainScale, type TimeScale, yearParts} from '../time';
import type {Moment, VpId} from '../types';
import {h} from './dom';
import {icons, inventionIcons} from './icons';

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
  for (const vp of s.vps) for (const m of data.vp[vp].moments) out.push({...m, vp});
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
  private selected: string | null = null;

  constructor(
    private data: AppData,
    private store: Store,
    onStep: (dir: -1 | 1) => void,
    private onInvention: (id: string) => void,
  ) {
    this.playBtn = h('button.tl-play', {type: 'button', 'aria-label': 'Play', onclick: () => store.set({playing: !store.state.playing})});
    this.speedBtn = h('button.tl-speed', {
      type: 'button',
      title: 'Playback speed',
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
      title: 'Show every journey as the timeline plays',
      'aria-label': 'Show every journey as the timeline plays',
      html: icons.route,
      onclick: () => store.set({allJourneys: !store.state.allJourneys}),
    });
    this.svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svgEl.classList.add('tl-svg');
    this.handle = h('div.tl-handle', h('div.tl-handle-knob'));
    this.tip = h('div.tl-tip');
    this.track = h('div.tl-track', {role: 'slider', tabindex: '0', 'aria-label': 'Year'}, this.svgEl, this.handle, this.tip);
    this.yearNum = h('span.tl-year-num');
    this.yearEra = h('span.tl-year-era');
    this.caption = h('div.tl-caption');
    this.el = h(
      'footer.timeline.panel',
      h(
        'div.tl-controls',
        h('button.tl-step', {type: 'button', 'aria-label': 'Previous key moment', title: 'Previous  ←', onclick: () => onStep(-1), html: icons.prev}),
        this.playBtn,
        h('button.tl-step', {type: 'button', 'aria-label': 'Next key moment', title: 'Next  →', onclick: () => onStep(1), html: icons.next}),
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
    const patchAt = (x: number) => (this.geo ? {progress: x * (stepCount(this.geo) - 1)} : {year: this.scale.fromX(x)});
    const tipAt = (x: number) => {
      if (!this.geo) return formatYear(this.scale.fromX(x));
      const st = this.geo.stops[Math.min(this.geo.stops.length - 1, Math.round(x * (stepCount(this.geo) - 1)))];
      return `${st.stop.place ?? ''} · ${st.stop.date ?? formatYear(st.year)}`;
    };
    let dragging = false;
    this.track.addEventListener('pointerdown', e => {
      if ((e.target as Element).closest('.tl-moment, .tl-invention')) return;
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
    this.speedBtn.title = this.journeyPace ? 'Journey pace: playback slows while a journey is under way' : 'Playback speed';
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
    const x = geo ? s.progress / Math.max(1, stepCount(geo) - 1) : this.scale.toX(s.year);
    this.handle.style.left = `${x * 100}%`;
    this.track.setAttribute('aria-valuenow', String(Math.round(s.year)));
    this.track.setAttribute('aria-valuetext', formatYear(s.year));
    const p = yearParts(s.year);
    this.yearNum.textContent = p.num;
    this.yearEra.textContent = p.era;
    this.playBtn.innerHTML = s.playing ? icons.pause : icons.play;
    this.playBtn.setAttribute('aria-label', s.playing ? 'Pause' : 'Play');
    this.playBtn.classList.toggle('playing', s.playing);
    this.setPace(this.journeyPace, s);
    this.allBtn.hidden = !!s.journey;
    this.allBtn.classList.toggle('active', s.allJourneys);
    this.allBtn.setAttribute('aria-pressed', String(s.allJourneys));
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
    const sc = this.scale;
    const parts: string[] = [];
    const base = 30;
    const steps = geo ? stepCount(geo) - 1 : 0;
    const X = geo ? (i: number) => (i / Math.max(1, steps)) * W : (y: number) => sc.toX(y) * W;
    // The recent, crowded centuries get a light wash so the stretched scale reads as deliberate.
    if (!geo && sc.kind === 'main') {
      parts.push(`<rect x="${X(1800)}" y="${base - 22}" width="${X(2026) - X(1800)}" height="22" class="tl-wash"/>`);
    }
    parts.push(`<line x1="0" x2="${W}" y1="${base}" y2="${base}" class="tl-axis"/>`);
    // Labels never overlap: each must start past the previous one's right edge.
    let lastRight = -Infinity;
    const label = (x: number, text: string, cls = 'tl-label') => {
      const w = text.length * 6.1;
      const anchor = x - w / 2 < 0 ? 'start' : x + w / 2 > W ? 'end' : 'middle';
      const left = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
      if (left < lastRight + 8) return;
      parts.push(`<text x="${x}" y="${base + 16}" text-anchor="${anchor}" class="${cls}">${text}</text>`);
      lastRight = left + w;
    };
    if (geo) {
      let lastYear = NaN;
      geo.stops.forEach((st, i) => {
        parts.push(`<line x1="${X(i)}" x2="${X(i)}" y1="${base}" y2="${base + 3}" class="tl-tick"/>`);
        const y = Math.round(st.year);
        if (y !== lastYear) label(X(i), formatYear(y));
        lastYear = y;
      });
      if (geo.epilogue) label(X(steps), formatYear(geo.homeKnows), 'tl-label home');
    } else {
      for (const t of sc.ticks()) {
        const x = X(t.year);
        parts.push(`<line x1="${x}" x2="${x}" y1="${base}" y2="${base + (t.major ? 6 : 3)}" class="tl-tick${t.major ? ' major' : ''}"/>`);
        if (t.label) label(x, t.label);
      }
    }
    svg.innerHTML = parts.join('');

    for (const el of this.track.querySelectorAll('.tl-moment, .tl-invention')) el.remove();
    // Inventions sit on the axis as small brass rings, under the viewpoint's own key moments.
    if (!geo) {
      for (const inv of this.data.inventions) {
        const x = sc.toX(inv.mid);
        if (x < 0 || x > 1) continue;
        this.track.appendChild(
          h('button.tl-invention', {
            type: 'button',
            style: `left:${x * 100}%`,
            title: `${formatYear(inv.mid)} · ${inv.name}`,
            'aria-label': `Invention, ${formatYear(inv.mid)}: ${inv.name}`,
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
    const color = geo ? this.data.vp[geo.journey.viewpoint].color : '';
    const marks = geo
      ? [
          ...geo.stops.map((st, i) => ({year: st.year, label: st.stop.place ?? '', color, i, x: i / Math.max(1, steps)})),
          ...(geo.epilogue ? [{year: geo.homeKnows, label: 'The news reaches home', color, i: steps, x: 1}] : []),
        ]
      : this.moments.map(m => ({year: m.year, label: m.label, color: this.data.vp[m.vp].color, i: -1, x: sc.toX(m.year)}));
    for (const m of marks) {
      const x = Math.max(0, Math.min(1, m.x));
      const b = h('button.tl-moment', {
        type: 'button',
        style: `left:${x * 100}%;--m:${m.color}`,
        title: `${formatYear(m.year)} · ${m.label}`,
        'aria-label': `${formatYear(m.year)}: ${m.label}`,
        onclick: (e: Event) => {
          e.stopPropagation();
          if (m.i >= 0) this.store.set({progress: m.i, playing: false});
          else this.store.set({year: m.year, playing: false});
          this.showCaption(m.label, m.color);
        },
      });
      if (geo) b.classList.add('stop');
      this.track.appendChild(b);
    }
  }
}
