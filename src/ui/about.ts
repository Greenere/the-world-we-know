import type {AppData} from '../data';
import type {State, Store} from '../state';
import {LEVEL_NAMES} from '../types';
import {h} from './dom';
import {icons} from './icons';
import {fogAlphaFor} from './cards';

const MEANING = [
  'No awareness at all.',
  'Hearsay: a name, no reliable location.',
  'Trade goods or travellers arrive; no maps.',
  'Usable sailing knowledge of the shore.',
  'Main routes, cities and rivers known.',
  'Systematic measurement.',
];

export class About {
  el: HTMLElement;

  constructor(data: AppData, store: Store) {
    const counts = `${data.regions.filter(r => !r.hidden).length} regions, ${data.cities.length} cities, ${data.journeys.length} journeys and ${data.inventions.length} inventions`;
    this.el = h(
      'div.modal-overlay',
      {onclick: (e: Event) => e.target === this.el && store.set({panel: 'none'})},
      h(
        'article.modal.panel',
        {role: 'dialog', 'aria-label': 'About this atlas'},
        h('button.card-close', {type: 'button', 'aria-label': 'Close', onclick: () => store.set({panel: 'none'}), html: icons.close}),
        h('div.card-kicker', 'About this atlas'),
        h('h2.modal-title', 'The World We Know'),
        h(
          'p.modal-lede',
          'For any year and any viewpoint, this map shows how much of the world a culture knew. Fog covers what it did not. Follow the travellers who pushed that knowledge outward, and watch the fog lift when their news reaches home, or come back when knowledge is lost.',
        ),
        h('h3.card-h', 'Reading the fog'),
        h(
          'ul.about-levels',
          LEVEL_NAMES.map((n, i) => h('li', h('span.fog-swatch', {style: `--a:${fogAlphaFor(i)}`}), h('strong', n), h('span', MEANING[i]))),
        ),
        h('h3.card-h', 'Viewpoints'),
        h(
          'p',
          'A viewpoint is a culture’s shared knowledge, not one person’s. Knowledge counts once it reaches home: through a returning envoy, a merchant’s report, a book or a map. After about 1900 the four viewpoints share one map, and fog marks the last places no one had reached: the poles, the highest peak, the deepest sea, and space.',
        ),
        h(
          'p',
          'The Humanity layer is different: it shows when modern humans first arrived. We say “first known to” a viewpoint, never “discovered”. Someone was usually already there.',
        ),
        h('h3.card-h', 'Keys'),
        h(
          'dl.keys',
          [
            ['← →', 'Previous / next key moment, or journey stop'],
            ['Shift ← →', 'One year back / forward'],
            ['Space', 'Play or pause'],
            ['/', 'Search'],
            ['Esc', 'Close cards'],
          ].map(([k, v]) => [h('dt', h('kbd', k)), h('dd', v)]),
        ),
        h('h3.card-h', 'Sources and accuracy'),
        h(
          'p',
          `This first version holds ${counts}. Every knowledge change, journey stop, city date and invention carries a source and a confidence rating, shown on its card. Dates are approximate until each viewpoint has been reviewed by a specialist; Polynesian dates in particular come from archaeology and genetics and carry wide ranges. The basemap is Natural Earth (public domain).`,
        ),
      ),
    );
    this.el.hidden = true;
  }

  update(s: State) {
    this.el.hidden = s.panel !== 'about';
  }
}
