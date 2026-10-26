import type {AppData} from '../data';
import type {JourneyGeo} from '../journey-geo';
import type {State} from '../state';
import {t, tx} from '../i18n';
import {HUMANITY_LEVEL_NAMES, LEVEL_NAMES} from '../types';
import {mixHex} from './color';
import {h} from './dom';
import {fogAlphaFor} from './cards';

const SHORT_LEVEL_NAMES = ['Unknown', 'Rumor', 'Contact', 'Coast', 'Interior', 'Surveyed'];

/** What the fog means, as a row in the title card: one swatch per level, or the tints of compare mode. */
export class Legend {
  el: HTMLElement;
  private key = '';

  constructor(private data: AppData) {
    this.el = h('div.legend', {'aria-label': t('Legend')});
  }

  update(s: State, geo: JourneyGeo | null) {
    const key = `${s.compare}|${s.vps.join()}|${geo?.journey.id}`;
    if (key === this.key) return;
    this.key = key;
    this.el.replaceChildren();
    if (s.compare && s.vps.length === 2) {
      const [a, b] = s.vps.map(v => this.data.vp[v]);
      const both = mixHex(a.color, b.color, 0.5, 0.08);
      this.el.append(
        h(
          'ul.legend-tints',
          [
            [a.color, t('{vp} only', {vp: tx.viewpoint(a.id, 'name', a.name)})],
            [b.color, t('{vp} only', {vp: tx.viewpoint(b.id, 'name', b.name)})],
            [both, t('Both')],
            ['', t('Neither')],
          ].map(([c, label]) => h('li', h('span.tint', {style: c ? `--c:${c}` : '', class: c ? '' : 'none'}), label)),
        ),
      );
      return;
    }
    const humanity = s.vps[0] === 'humanity';
    const names = humanity ? HUMANITY_LEVEL_NAMES : LEVEL_NAMES;
    // One short word under each swatch, so the row fits the title card; the full name is the tooltip.
    const short = humanity ? names : SHORT_LEVEL_NAMES;
    const levels = humanity ? [0, 3, 5] : [0, 1, 2, 3, 4, 5];
    this.el.append(
      h(
        'ul.legend-levels',
        {'aria-label': t(humanity ? 'People' : 'What was known')},
        levels.map(l => h('li', {title: t(names[l])}, h('span.fog-swatch', {style: `--a:${fogAlphaFor(l)}`}), h('span.legend-name', t(short[l])))),
      ),
    );
    if (geo) {
      const color = this.data.vp[geo.journey.viewpoint].color;
      this.el.append(
        h(
          'div.legend-seen',
          h('span.seen-swatch', {style: `--c:${color}`}),
          h('span', t('Seen on the journey, '), h('em', t('not yet known at home'))),
        ),
      );
    }
  }
}
