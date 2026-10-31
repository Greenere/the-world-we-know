import type {AppData} from '../data';
import {shortCitation} from '../data';
import type {JourneyGeo} from '../journey-geo';
import {currentStopIndex} from '../journey-geo';
import type {State, Store} from '../state';
import {formatYear} from '../time';
import type {Journey} from '../types';
import {isZh, t, tx} from '../i18n';
import {h, setIcon} from './dom';
import {icons, kindIcons} from './icons';
import {JourneyDetails, type JourneyDetailsActions} from './journey-details';

/** A journey's sketchbook plate, made by the cards, which own the plates and the lightbox. */
export interface ScenePlate {
  el: HTMLElement;
  show(progress: number): void;
  /** Hold travel while the stop's sketchbook pages are being read. */
  advance(dt: number, progress: number, speed: number): boolean;
  /** The sketch on show, small, or null before one has loaded. */
  thumb(): string | null;
}

export interface JourneyCardActions extends JourneyDetailsActions {
  step(dir: -1 | 1): void;
  close(): void;
  recenter(): void;
  switchTo(id: string, year: number): void;
  openCity(id: string): void;
  /** Close the card open below, so the journey card unfolds. */
  unfold(): void;
}

/**
 * The journey being followed, at the top of the cards on the right. A pinned head names it and switches between
 * its two faces: the stop the traveller has reached (its note, how they got there, its sketch), and all its stops
 * with what it made known. Playing is the timeline's. When another card opens below it (a city, a region) the
 * whole card folds to a single line, which unfolds it again when clicked.
 */
export class JourneyCard {
  el: HTMLElement;
  /** The head and the scrolling body: the face that gives way to the strip when the card folds. */
  private main: HTMLElement;
  private head: HTMLElement;
  private scroller: HTMLElement;
  private story: HTMLElement;
  private details: JourneyDetails;
  private strip: HTMLElement;
  private title = h('h2.jc-title');
  private years = h('span.jc-years');
  private kind = h('span.jc-kind');
  private tabs: {stop: HTMLButtonElement; all: HTMLButtonElement};
  /** Which face the body shows: the stop, or all stops; null before the first update. */
  private showingAll: boolean | null = null;
  /** The fold or unfold under way, so a quick second click starts from where it is. */
  private morphing: Animation[] = [];
  private stopEl = h('div.jc-stop');
  /** Where the stop falls: "Stop 9 of 69 · 1272". */
  private count = h('span.jc-count');
  private stripThumb = h('span.jc-strip-thumb');
  private stripName = h('span.jc-strip-name');
  private stripPlace = h('span.jc-strip-place');
  private playBtns: HTMLButtonElement[] = [];
  private viewBtns: {follow: HTMLButtonElement; route: HTMLButtonElement} | null = null;
  private plate: ScenePlate | null = null;
  /** The journey the card is built for, and the stop its text is for. */
  private key = '';
  private stopKey = '';
  private thumbSrc: string | null = null;
  /** Parties this journey sent out, by the stop they set out from. */
  private forks = new Map<number, Journey[]>();

  constructor(
    private data: AppData,
    private store: Store,
    private actions: JourneyCardActions,
    /** Makes the journey's sketchbook plate; `shown` is told when it shows a sketch (they load later). */
    private makePlate: (j: Journey, shown: () => void) => ScenePlate,
  ) {
    this.story = h('div.jc-story');
    this.scroller = h('div.card-scroll');
    this.details = new JourneyDetails(data, store, actions, () => this.scroller);
    this.scroller.append(h('div.card-body', this.story, this.details.el));
    const tab = (all: boolean, label: string) =>
      h('button.jc-tab', {type: 'button', role: 'tab', onclick: () => this.store.set({details: all})}, t(label)) as HTMLButtonElement;
    this.tabs = {stop: tab(false, 'This stop'), all: tab(true, 'All stops')};
    this.head = h(
      'div.jc-head',
      h(
        'div.jc-name',
        this.kind,
        h('div.jc-name-text', this.title, this.years),
        h('button.jc-close', {type: 'button', 'aria-label': t('Close journey'), title: t('Close journey'), onclick: () => this.actions.close(), html: icons.close}),
      ),
      h('div.jc-bar', h('div.jc-tabs', {role: 'tablist', 'aria-label': t('Journey')}, this.tabs.stop, this.tabs.all), this.viewToggle()),
    );
    this.main = h('div.jc-main', this.head, this.scroller);
    const strip = (this.strip = h(
      'div.jc-strip',
      h(
        'button.jc-strip-main',
        {type: 'button', title: t('Back to the journey'), onclick: () => this.actions.unfold()},
        this.stripThumb,
        h('span.jc-strip-text', this.stripName, this.stripPlace),
      ),
    ));
    this.el = h('aside.card.panel.journey-card', strip, this.main);
    this.el.hidden = true;
    this.scroller.addEventListener('scroll', () => this.el.classList.toggle('scrolled', this.scroller.scrollTop > 4), {passive: true});
  }

  update(s: State, geo: JourneyGeo | null, folded: boolean) {
    this.el.hidden = !geo;
    if (!geo) {
      this.key = '';
      this.plate = null;
      return;
    }
    const fresh = geo.journey.id !== this.key;
    if (fresh) this.build(geo);
    this.face(s.details, !fresh);
    // Fill in the stop before measuring, so an unfold grows to the card's real height.
    this.progress(s, geo);
    this.details.progress(s, geo, s.details && !folded);
    if (folded !== this.el.classList.contains('folded')) this.fold(folded, !fresh);
  }

  /** Who else is travelling right now, for the list of all stops. */
  setMeanwhile(others: Parameters<JourneyDetails['setMeanwhile']>[0]) {
    this.details.setMeanwhile(others);
  }

  /** Show the stop, or all stops, starting from the top; the list scrolls itself to the current stop. */
  private face(all: boolean, animate: boolean) {
    if (all === this.showingAll) return;
    this.showingAll = all;
    this.story.hidden = all;
    this.details.el.hidden = !all;
    for (const [b, on] of [[this.tabs.stop, !all], [this.tabs.all, all]] as const) {
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
    }
    this.scroller.scrollTop = 0;
    this.el.classList.remove('scrolled');
    if (animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      (all ? this.details.el : this.story).animate([{opacity: 0, transform: 'translateY(4px)'}, {opacity: 1, transform: 'none'}], {duration: 220, easing: 'ease-out'});
    }
  }

  /**
   * Fold to the one-line strip, or unfold back to the card. The card's height eases between the two while the
   * face that is leaving fades out over the one arriving; the card opened below rides up or down with it.
   */
  private fold(folded: boolean, animate: boolean) {
    const el = this.el;
    for (const a of this.morphing) a.cancel();
    this.morphing = [];
    el.classList.remove('folding', 'unfolding');
    const from = el.getBoundingClientRect().height;
    el.classList.toggle('folded', folded);
    // Unfolding means the card below is closing: take it away first, so the journey card grows to its full height.
    const below = el.nextElementSibling as HTMLElement | null;
    if (!folded && below) below.hidden = true;
    if (!animate || el.hidden || !from || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const to = el.getBoundingClientRect().height;
    // Both faces stay on show while the card changes shape: the leaving one clipped by the card and fading out.
    el.classList.add(folded ? 'folding' : 'unfolding');
    const ease = 'cubic-bezier(0.25, 0.8, 0.25, 1)';
    const shape = el.animate([{height: `${from}px`}, {height: `${to}px`}], {duration: 340, easing: ease, fill: 'forwards'});
    const [leaving, arriving] = folded ? [this.main, this.strip] : [this.strip, this.main];
    this.morphing = [
      shape,
      leaving.animate([{opacity: 1}, {opacity: 0}], {duration: 180, easing: 'ease-in', fill: 'forwards'}),
      arriving.animate([{opacity: 0}, {opacity: 1}], {duration: 240, delay: 100, easing: 'ease-out', fill: 'backwards'}),
    ];
    shape.finished
      .then(() => {
        el.classList.remove('folding', 'unfolding');
        for (const a of this.morphing) a.cancel();
        this.morphing = [];
      })
      .catch(() => {});
  }

  /** Hold travel while the open card's sketchbook pages are being read. */
  advance(dt: number, s: State): boolean {
    return s.playing && !this.el.hidden && !this.el.classList.contains('folded') && !!this.plate?.advance(dt, s.progress, s.speed);
  }

  private build(geo: JourneyGeo) {
    const j = geo.journey;
    const vp = this.data.vp[j.viewpoint];
    this.key = j.id;
    this.stopKey = '';
    this.thumbSrc = null;
    this.forks.clear();
    // Each party sets out from the last stop of its fork's name before it left.
    for (const c of this.data.journeyChildren.get(j.id) ?? []) {
      const at = geo.stops.map((st, i) => ({st, i})).filter(({st}) => st.stop.place === c.fork);
      const k = (at.filter(({st}) => st.t <= c.t[0] + 1e-6).pop() ?? at[0])?.i;
      if (k !== undefined) this.forks.set(k, [...(this.forks.get(k) ?? []), c]);
    }
    this.plate = j.pictures ? this.makePlate(j, () => queueMicrotask(() => this.showThumb())) : null;
    const name = tx.journey(j.id, 'name', j.name);
    this.el.style.setProperty('--j', vp.color);
    this.stripName.textContent = name;
    this.stripThumb.innerHTML = kindIcons[j.kind] ?? kindIcons.traveler;
    this.stripThumb.classList.remove('picture');
    this.playBtns = [];
    this.kind.innerHTML = kindIcons[j.kind] ?? kindIcons.traveler;
    this.kind.title = t(j.kind);
    this.title.textContent = name;
    this.title.title = name;
    this.years.textContent = tx.journey(j.id, 'years', j.years);
    this.story.replaceChildren(
      ...([
        this.parentLink(j),
        // Playing is the timeline's. On a phone the journey's sheet covers the timeline, so the card has its own
        // controls, and says where the stop falls, here.
        h(
          'div.jc-stopline',
          h(
            'span.jc-controls',
            h('button.jp-step', {type: 'button', 'aria-label': t('Previous stop'), onclick: () => this.actions.step(-1), html: icons.prev}),
            this.playButton(),
            h('button.jp-step', {type: 'button', 'aria-label': t('Next stop'), onclick: () => this.actions.step(1), html: icons.next}),
          ),
          this.count,
        ),
        this.stopEl,
        this.plate?.el,
      ].filter(Boolean) as Node[]),
    );
    this.details.build(geo);
    this.showingAll = null;
    this.scroller.scrollTop = 0;
    this.el.classList.remove('scrolled');
  }

  private progress(s: State, geo: JourneyGeo) {
    const j = geo.journey;
    const n = geo.stops.length;
    const cur = currentStopIndex(geo, s.progress);
    const home = geo.epilogue && s.progress > n - 1 + 0.5;
    const st = geo.stops[cur].stop;
    this.count.textContent = home
      ? `${t('At home')} · ${formatYear(geo.homeKnows)}`
      : `${t('Stop {n} of {total}', {n: cur + 1, total: n})} · ${st.date ? tx.stop(j.id, cur, 'date', st.date) : formatYear(geo.stops[cur].year)}`;
    for (const b of this.playBtns) {
      setIcon(b, s.playing ? icons.pause : icons.play);
      b.setAttribute('aria-label', t(s.playing ? 'Pause journey' : 'Play journey'));
    }
    if (this.viewBtns) {
      this.viewBtns.follow.classList.toggle('active', s.follow);
      this.viewBtns.follow.setAttribute('aria-pressed', String(s.follow));
      this.viewBtns.route.classList.toggle('active', !s.follow);
      this.viewBtns.route.setAttribute('aria-pressed', String(!s.follow));
    }
    const key = home ? 'home' : String(cur);
    if (key !== this.stopKey) {
      const first = !this.stopKey;
      this.stopKey = key;
      this.stopEl.replaceChildren(...((home ? this.homeText(geo) : this.stopText(geo, cur)).filter(Boolean) as Node[]));
      this.stripPlace.textContent = home ? t('The news reaches home') : `${tx.stop(j.id, cur, 'place', geo.stops[cur].stop.place ?? '')} · ${formatYear(geo.stops[cur].year)}`;
      if (!first) {
        this.stopEl.classList.remove('swap');
        void this.stopEl.offsetWidth;
        this.stopEl.classList.add('swap');
      }
    }
    this.plate?.show(s.progress);
    this.showThumb();
  }

  /** The folded line shows the sketch on show once there is one, else the journey's sign. */
  private showThumb() {
    const thumb = this.plate?.thumb() ?? null;
    if (!thumb || thumb === this.thumbSrc) return;
    this.thumbSrc = thumb;
    this.stripThumb.replaceChildren(h('img', {src: thumb, alt: '', decoding: 'async'}));
    this.stripThumb.classList.add('picture');
  }

  private stopText(geo: JourneyGeo, i: number): (Node | null)[] {
    const j = geo.journey;
    const s = geo.stops[i].stop;
    const src = s.source ?? j.source;
    const city = s.city ? this.data.cityById.get(s.city) : undefined;
    const place = tx.stop(j.id, i, 'place', s.place ?? '');
    const leg = this.legText(geo, i);
    return [
      h('h3.jc-place', place),
      leg ? h('div.jc-leg', leg) : null,
      s.note ? h('p.jc-note', tx.stop(j.id, i, 'note', s.note)) : null,
      h('div.jp-stop-src', {title: this.data.sources[src]?.citation ?? src}, shortCitation(this.data.sources, src), s.confidence && s.confidence !== j.confidence ? ` · ${t('{level} confidence', {level: t(s.confidence)})}` : ''),
      ...(this.forks.get(i) ?? []).map(c =>
        h(
          'button.jp-stop-fork',
          {
            type: 'button',
            style: `--chip:${this.data.vp[c.viewpoint].color}`,
            title: t('Follow {name}', {name: tx.journey(c.id, 'name', c.name)}),
            onclick: () => this.actions.switchTo(c.id, c.t[0]),
          },
          h('span.jp-stop-fork-icon', {html: kindIcons[c.kind] ?? kindIcons.traveler}),
          t('{name} sets out from here', {name: tx.journey(c.id, 'name', c.name)}),
        ),
      ),
      city ? h('button.linkish.jc-city', {type: 'button', onclick: () => this.actions.openCity(city.id)}, t('More about {place}', {place: shortPlace(place)}), ' ›') : null,
    ];
  }

  private homeText(geo: JourneyGeo): Node[] {
    const n = geo.stops.length;
    const last = geo.stops[n - 1];
    const years = geo.homeKnows - last.year;
    return [
      h('h3.jc-place', t('The news reaches home')),
      years >= 1
        ? h('div.jc-leg', t('{time} after {place}', {time: timeText(years * 12, 'months'), place: shortPlace(tx.stop(geo.journey.id, n - 1, 'place', last.stop.place ?? ''))}))
        : null,
      h('p.jc-note', t('Only now does the fog lift.')),
    ].filter(Boolean) as Node[];
  }

  /**
   * How the traveller came to stop `i`: from where, how far and by what means, and how long it took when both
   * ends are dated. Times between undated stops are spread by distance, so they aren't given as durations.
   */
  private legText(geo: JourneyGeo, i: number): string {
    const leg = geo.legs.find(l => l.to === i);
    if (!leg) return '';
    const j = geo.journey;
    const from = geo.stops[leg.origin];
    const parts = [t('From {place}', {place: shortPlace(tx.stop(j.id, leg.origin, 'place', from.stop.place ?? ''))})];
    if (leg.onMap && leg.km >= 5) {
      const km = (leg.km < 100 ? Math.max(10, Math.round(leg.km / 10) * 10) : leg.km < 1000 ? Math.round(leg.km / 10) * 10 : Math.round(leg.km / 50) * 50).toLocaleString('en');
      const mode = j.modes?.[i] ?? 'land';
      parts.push(t(MODE_TEXT[mode] ?? MODE_TEXT.direct, {km}));
    }
    const took = between(from.stop.date, geo.stops[i].stop.date);
    if (took) parts.push(took);
    return parts.join(' · ');
  }

  private playButton(): HTMLButtonElement {
    const b = h('button.jp-play', {type: 'button', onclick: () => this.store.set({playing: !this.store.state.playing})}) as HTMLButtonElement;
    this.playBtns.push(b);
    return b;
  }

  /** Camera: follow the traveller (the default) or show the whole route. */
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

  /** For a party sent out from a larger journey: the journey it belongs to, opened at the moment it set out. */
  private parentLink(j: Journey): HTMLElement | null {
    const p = j.parent ? this.data.journeyById.get(j.parent) : undefined;
    if (!p) return null;
    const name = tx.journey(p.id, 'name', p.name);
    return h(
      'p.jp-parent',
      t('Part of '),
      h('button.linkish', {type: 'button', style: `color:${this.data.vp[p.viewpoint].color}`, title: t('Follow {name} from here', {name}), onclick: () => this.actions.switchTo(p.id, j.t[0])}, name),
    );
  }
}

const MODE_TEXT: Record<string, string> = {
  land: 'about {km} km overland',
  sea: 'about {km} km by sea',
  river: 'about {km} km by river',
  mixed: 'about {km} km by land and sea',
  direct: 'about {km} km',
};

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** "12 April 1961" or "April 1961" as a day count, and whether the day was given. */
function parseDate(text: string | undefined): {days: number; exact: boolean} | null {
  const m = text?.trim().match(/^(?:(\d{1,2}) )?([A-Za-z]+) (\d+)( BCE)?$/);
  const month = m ? MONTHS.indexOf(m[2].toLowerCase()) : -1;
  if (!m || month < 0) return null;
  const year = m[4] ? 1 - Number(m[3]) : Number(m[3]);
  return {days: year * 365.25 + month * 30.44 + (m[1] ? Number(m[1]) - 1 : 14), exact: !!m[1]};
}

/** How long between two dated stops: in days when both dates give the day, else in months; '' when undated. */
function between(a: string | undefined, b: string | undefined): string {
  const x = parseDate(a);
  const y = parseDate(b);
  if (!x || !y) return '';
  const days = y.days - x.days;
  if (x.exact && y.exact && days >= 1 && days < 60) return timeText(days, 'days');
  return days >= 30 ? timeText(days / 30.44, 'months') : '';
}

/** A span of time, to a sensible precision: "3 days", "5 months", "2½ years". */
function timeText(n: number, unit: 'days' | 'months'): string {
  if (unit === 'days') {
    const d = Math.round(n);
    return d === 1 ? t('a day') : t('{n} days', {n: d});
  }
  const months = Math.round(n);
  if (months < 18) return months <= 1 ? t('a month') : t('{n} months', {n: months});
  const half = Math.round((n / 12) * 2) / 2;
  const whole = Math.floor(half);
  return t('{n} years', {n: half % 1 ? (isZh() ? `${whole}.5` : `${whole}½`) : String(whole)});
}

/** "Tauris (Tabriz)" as Tauris, for a short link. */
const shortPlace = (s: string) => s.replace(/\s*[（(][^（()）]*[)）]\s*$/, '') || s;
