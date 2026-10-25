import type {AppData} from '../data';
import type {JourneyGeo} from '../journey-geo';
import {currentStopIndex} from '../journey-geo';
import type {State} from '../state';
import type {VpId} from '../types';
import {t} from '../i18n';
import {h} from './dom';

const levelAt = (changes: [number, number, number][] | undefined, year: number) => {
  let l = 0;
  for (const [y, lv] of changes ?? []) {
    if (y > year) break;
    l = lv;
  }
  return l;
};

const FOG = [0.92, 0.8, 0.62, 0.42, 0.18, 0];

/** From 1957: a small orrery of what is known beyond the Earth. */
export class Inset {
  el: HTMLElement;
  private svg: SVGSVGElement;
  private key = '';

  constructor(private data: AppData) {
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('viewBox', '0 0 236 112');
    this.svg.setAttribute('role', 'img');
    this.el = h('div.inset.panel', h('div.inset-title', t('Beyond Earth')), this.svg);
    this.el.hidden = true;
  }

  update(s: State, geo: JourneyGeo | null, now: number) {
    const spaceJourney = geo?.journey.space ?? null;
    const show = s.year >= 1957 || !!spaceJourney;
    this.el.hidden = !show;
    this.el.classList.toggle('large', !!spaceJourney);
    if (!show) return;
    const vp: VpId = s.vps[0];
    const year = s.year;
    const leo = levelAt(this.data.beyond.leo?.[vp], year);
    const moon = levelAt(this.data.beyond.moon?.[vp], year);
    const cur = geo ? currentStopIndex(geo, s.progress) : -1;
    const phase = geo && spaceJourney === 'moon' ? geo.stops[cur]?.stop.body ?? 'earth' : null;
    const orbiting = (spaceJourney === 'orbit' && geo) || (year >= 1957 && year < 1958.5);
    const key = `${vp}|${leo}|${moon}|${phase}|${orbiting ? Math.floor(now / 40) : 0}|${spaceJourney}`;
    if (key === this.key) return;
    this.key = key;

    const ex = 46;
    const ey = 56;
    const mx = 196;
    const my = 50;
    const ang = (now / 6000) * Math.PI * 2;
    const craft = orbiting ? `<circle cx="${ex + Math.cos(ang) * 30}" cy="${ey + Math.sin(ang) * 12}" r="2.4" class="in-craft"/>` : '';
    const moonFog = FOG[moon];
    const leoFog = FOG[leo];
    const apolloPath = `M ${ex + 26} ${ey - 6} C 110 ${ey - 44}, 160 ${my - 40}, ${mx + 2} ${my - 15} C ${mx + 20} ${my - 6}, ${mx + 18} ${my + 14}, ${mx} ${my + 15} C 160 ${my + 40}, 110 ${ey + 44}, ${ex + 26} ${ey + 8}`;
    const showPath = spaceJourney === 'moon' || year >= 1969;
    const pathCls = spaceJourney === 'moon' ? 'in-path active' : 'in-path';
    const phaseDot =
      phase === 'moon'
        ? `<circle cx="${mx - 3}" cy="${my + 2}" r="2.6" class="in-craft"/>`
        : phase === 'moon-orbit'
          ? `<circle cx="${mx + 16}" cy="${my - 6}" r="2.6" class="in-craft"/>`
          : phase === 'orbit'
            ? `<circle cx="${ex + 30}" cy="${ey - 6}" r="2.6" class="in-craft"/>`
            : '';
    this.svg.innerHTML = `
      <defs>
        <radialGradient id="in-earth" cx="40%" cy="38%" r="70%"><stop offset="0" stop-color="#d5dccb"/><stop offset="1" stop-color="#a9b8a6"/></radialGradient>
        <radialGradient id="in-moon" cx="40%" cy="38%" r="70%"><stop offset="0" stop-color="#ebe4d2"/><stop offset="1" stop-color="#bcb29c"/></radialGradient>
      </defs>
      <ellipse cx="${ex}" cy="${ey}" rx="30" ry="12" class="in-orbit" style="opacity:${0.35 + (1 - leoFog) * 0.65}"/>
      ${showPath ? `<path d="${apolloPath}" class="${pathCls}"/>` : ''}
      <circle cx="${ex}" cy="${ey}" r="17" fill="url(#in-earth)" class="in-body"/>
      <path d="M ${ex - 9} ${ey - 9} q 6 -3 9 2 q 4 5 -2 9 q -5 3 -9 -3 z M ${ex + 4} ${ey + 3} q 5 -2 7 3 q -2 5 -6 4 z" class="in-land"/>
      <circle cx="${mx}" cy="${my}" r="12" fill="url(#in-moon)" class="in-body"/>
      <circle cx="${mx - 4}" cy="${my - 3}" r="2.4" class="in-crater"/><circle cx="${mx + 4}" cy="${my + 4}" r="1.6" class="in-crater"/><circle cx="${mx + 3}" cy="${my - 6}" r="1.2" class="in-crater"/>
      <circle cx="${mx}" cy="${my}" r="13.5" class="in-fog" style="opacity:${moonFog}"/>
      ${moon >= 5 ? `<path d="M ${mx - 3} ${my + 2} v -7 l 4 1.5 -4 1.5" class="in-flag"/>` : ''}
      ${craft}${phaseDot}
      <text x="${ex}" y="${ey + 31}" class="in-label" text-anchor="middle">${t('Earth')}</text>
      <text x="${ex + 34}" y="${ey - 16}" class="in-label small">${t(leo >= 5 ? 'orbit · people' : leo >= 2 ? 'orbit · machines' : 'orbit')}</text>
      <text x="${mx}" y="${my + 27}" class="in-label" text-anchor="middle">${t(moon >= 5 ? 'Moon · walked on' : moon >= 3 ? 'Moon · landed on' : moon >= 2 ? 'Moon · reached' : 'Moon')}</text>
    `;
  }
}
