import type {AppData} from '../data';
import {loadPictures, shortCitation} from '../data';
import type {JourneyGeo} from '../journey-geo';
import {currentStopIndex} from '../journey-geo';
import type {State, Store} from '../state';
import {formatYear} from '../time';
import type {Journey} from '../types';
import {t, tx} from '../i18n';
import {h} from './dom';
import {icons, kindIcons} from './icons';
import {correctionLink, plainYear} from './correction';

export interface JourneyDetailsActions {
  openRegion(id: string): void;
  switchTo(id: string, year: number): void;
  jumpTo(year: number): void;
  showSketch(stop: number): void;
}

/**
 * A journey's "All stops" face in its card: who travelled, what it made known and to whom, who else was near,
 * and every stop, the current one marked. Clicking a stop goes there and back to reading it.
 */
export class JourneyDetails {
  el = h('div.jd');
  private stopEls: HTMLElement[] = [];
  private epilogueEl: HTMLElement | null = null;
  private meanwhileEl: HTMLElement | null = null;
  private meanwhileKey = '';
  /** Whether the list has been scrolled to the current stop since it came on show. */
  private revealed = false;

  constructor(
    private data: AppData,
    private store: Store,
    private actions: JourneyDetailsActions,
    /** The card's scrolling area, where the list is shown. */
    private scroller: () => HTMLElement,
  ) {}

  /** Fill in the details for a journey. */
  build(geo: JourneyGeo) {
    const j = geo.journey;
    this.stopEls = [];
    this.meanwhileKey = '';
    this.revealed = false;
    const informed = new Map<string, {region: string; year: number}[]>();
    for (const inf of j.informs) {
      if (!j.lifts.includes(inf.region)) continue;
      const list = informed.get(inf.viewpoint) ?? [];
      list.push({region: inf.region, year: inf.homeKnowsMid});
      informed.set(inf.viewpoint, list);
    }
    // Each party this journey sent out, at the stop it set out from: the last stop of that name before it left.
    const forks = new Map<number, Journey[]>();
    for (const c of this.data.journeyChildren.get(j.id) ?? []) {
      const at = geo.stops.map((st, i) => ({st, i})).filter(({st}) => st.stop.place === c.fork);
      const k = (at.filter(({st}) => st.t <= c.t[0] + 1e-6).pop() ?? at[0])?.i;
      if (k !== undefined) forks.set(k, [...(forks.get(k) ?? []), c]);
    }
    const stopsList = h(
      'ol.jp-stops',
      geo.stops.map((st, i) => {
        const s = st.stop;
        const src = s.source ?? j.source;
        const li = h(
          'li.jp-stop',
          {onclick: () => this.goTo(i)},
          h('span.jp-stop-dot'),
          h(
            'div.jp-stop-text',
            h('div.jp-stop-when', s.date ? tx.stop(j.id, i, 'date', s.date) : formatYear(st.year)),
            h('div.jp-stop-place', tx.stop(j.id, i, 'place', s.place ?? '')),
            s.note ? h('p.jp-stop-note', tx.stop(j.id, i, 'note', s.note)) : null,
            h('div.jp-stop-src', {title: this.data.sources[src]?.citation ?? src}, shortCitation(this.data.sources, src), s.confidence && s.confidence !== j.confidence ? ` · ${t('{level} confidence', {level: t(s.confidence)})}` : ''),
            (forks.get(i) ?? []).map(c =>
              h(
                'button.jp-stop-fork',
                {
                  type: 'button',
                  style: `--chip:${this.data.vp[c.viewpoint].color}`,
                  title: t('Follow {name}', {name: tx.journey(c.id, 'name', c.name)}),
                  onclick: (e: Event) => {
                    e.stopPropagation();
                    this.actions.switchTo(c.id, c.t[0]);
                  },
                },
                h('span.jp-stop-fork-icon', {html: kindIcons[c.kind] ?? kindIcons.traveler}),
                t('{name} sets out from here', {name: tx.journey(c.id, 'name', c.name)}),
              ),
            ),
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
        {onclick: () => this.goTo(geo.stops.length)},
        h('span.jp-stop-dot'),
        h('div.jp-stop-text', h('div.jp-stop-when', formatYear(geo.homeKnows)), h('div.jp-stop-place', t('The news reaches home')), h('p.jp-stop-note', t('Only now does the fog lift.'))),
      );
      stopsList.append(this.epilogueEl);
    } else {
      this.epilogueEl = null;
    }
    const nodes = [
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
      correctionLink(this.data, {kind: 'journey', id: j.id, name: j.name, context: st => {
        const i = currentStopIndex(geo, st.progress);
        const at = geo.stops[i];
        return [
          `${j.viewpoint} · ${j.kind} · ${j.years} · source ${j.source}, ${j.confidence} confidence`,
          at ? `At stop ${i + 1} of ${geo.stops.length}: ${at.stop.place ?? ''}, ${at.stop.date ?? plainYear(at.year)} · source ${at.stop.source ?? j.source}${at.stop.confidence ? `, ${at.stop.confidence} confidence` : ''}` : '',
          ...(at?.stop.note ? [`Its note: ${at.stop.note}`] : []),
        ].filter(Boolean);
      }}, () => this.store.state),
    ];
    this.el.replaceChildren(...(nodes.filter(Boolean) as Node[]));
  }

  /** Jump to a stop from the list, and go back to reading it. */
  private goTo(i: number) {
    this.store.set({progress: i, playing: false, details: false});
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
              ? [h('em', otherName), c.otherPlace
                  ? t(' was at {other}, {km} km from {place}.', {other: otherPlace, km: Math.round(c.km / 10) * 10, place})
                  : t(' was {km} km from {place}.', {km: Math.round(c.km / 10) * 10, place})]
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


  /** Scroll a stop into view in the card: at once when the list opens, smoothly as the traveller moves on. */
  private reveal(el: HTMLElement, smooth: boolean) {
    const sc = this.scroller();
    const box = sc.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const offset = r.top - box.top + sc.scrollTop;
    const top = offset - 10;
    const bottom = offset + r.height - sc.clientHeight + 16;
    const behavior = smooth ? 'smooth' : 'instant';
    if (!smooth) sc.scrollTo({top: Math.max(0, offset - sc.clientHeight / 3), behavior});
    else if (sc.scrollTop > top) sc.scrollTo({top, behavior});
    else if (sc.scrollTop < bottom) sc.scrollTo({top: Math.min(top, bottom), behavior});
  }

  /** Mark the stops passed and the current one; while the list is on show, keep the current one in view. */
  progress(s: State, geo: JourneyGeo, visible: boolean) {
    const cur = currentStopIndex(geo, s.progress);
    const inEpilogue = geo.epilogue && s.progress > geo.stops.length - 1 + 0.5;
    if (!visible) this.revealed = false;
    this.stopEls.forEach((el, i) => {
      el.classList.toggle('done', i < cur || inEpilogue);
      const active = i === cur && !inEpilogue;
      if (active && visible && (!el.classList.contains('current') || !this.revealed)) this.reveal(el, this.revealed);
      el.classList.toggle('current', active);
    });
    this.epilogueEl?.classList.toggle('current', inEpilogue);
    if (inEpilogue && visible && !this.revealed && this.epilogueEl) this.reveal(this.epilogueEl, false);
    if (visible) this.revealed = true;
  }
}
