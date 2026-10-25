import type {AppData} from '../data';
import type {JourneyGeo} from '../journey-geo';
import type {State} from '../state';
import {HUMANITY_LEVEL_NAMES, LEVEL_NAMES} from '../types';
import {mixHex} from './color';
import {h} from './dom';
import {fogAlphaFor} from './cards';

/** What the fog means: one swatch per level, or the three tints of compare mode. */
export class Legend {
  el: HTMLElement;
  private key = '';

  constructor(private data: AppData) {
    this.el = h('div.legend.panel', {'aria-label': 'Legend'});
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
        h('div.legend-title', 'Known to'),
        h(
          'ul.legend-tints',
          [
            [a.color, `${a.name} only`],
            [b.color, `${b.name} only`],
            [both, 'Both'],
            ['', 'Neither'],
          ].map(([c, label]) => h('li', h('span.tint', {style: c ? `--c:${c}` : '', class: c ? '' : 'none'}), label)),
        ),
      );
      return;
    }
    const names = s.vps[0] === 'humanity' ? HUMANITY_LEVEL_NAMES : LEVEL_NAMES;
    const levels = s.vps[0] === 'humanity' ? [0, 3, 5] : [0, 1, 2, 3, 4, 5];
    this.el.append(
      h('div.legend-title', s.vps[0] === 'humanity' ? 'People' : 'What was known'),
      h(
        'ul.legend-levels',
        levels.map(l => h('li', {title: names[l]}, h('span.fog-swatch', {style: `--a:${fogAlphaFor(l)}`}), h('span.legend-name', names[l]))),
      ),
    );
    if (geo) {
      const color = this.data.vp[geo.journey.viewpoint].color;
      this.el.append(
        h(
          'div.legend-seen',
          h('span.seen-swatch', {style: `--c:${color}`}),
          h('span', 'Seen on the journey, ', h('em', 'not yet known at home')),
        ),
      );
    }
  }
}
