import type {AppData} from '../data';
import type {State, Store} from '../state';
import {t} from '../i18n';
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
    const counts = t('{regions} regions, {cities} cities, {journeys} journeys and {inventions} inventions', {
      regions: data.regions.filter(r => !r.hidden).length,
      cities: data.cities.length,
      journeys: data.journeys.length,
      inventions: data.inventions.length,
    });
    this.el = h(
      'div.modal-overlay',
      {onclick: (e: Event) => e.target === this.el && store.set({panel: 'none'})},
      h(
        'article.modal.panel',
        {role: 'dialog', 'aria-label': t('About this atlas')},
        h('button.card-close', {type: 'button', 'aria-label': t('Close'), onclick: () => store.set({panel: 'none'}), html: icons.close}),
        h('div.card-kicker', t('About this atlas')),
        h('h2.modal-title', t('The World We Know')),
        h(
          'p.modal-lede',
          t('For any year and any viewpoint, this map shows how much of the world a culture knew. Fog covers what it did not. Follow the travellers who pushed that knowledge outward, and watch the fog lift when their news reaches home, or come back when knowledge is lost.'),
        ),
        h('h3.card-h', t('Reading the fog')),
        h(
          'ul.about-levels',
          LEVEL_NAMES.map((n, i) => h('li', h('span.fog-swatch', {style: `--a:${fogAlphaFor(i)}`}), h('strong', t(n)), h('span', t(MEANING[i])))),
        ),
        h('h3.card-h', t('Viewpoints')),
        h(
          'p',
          t('A viewpoint is a culture’s shared knowledge, not one person’s. Knowledge counts once it reaches home: through a returning envoy, a merchant’s report, a book or a map. After about 1900 the cultural viewpoints share one map, and fog marks the last places no one had reached: the poles, the highest peak, the deepest sea, and space.'),
        ),
        h(
          'p',
          t('Twenty-six cultural viewpoints. Two are knowledge communities, which know what their members know from the year each joins: Europe (Greece and Byzantium, Rome and Italy, Spain and Portugal, France, Britain and Ireland, Germany and the Low Countries, the Norse and Scandinavia, and from 1745 Russia) and the Islamic world (Arabia, Egypt, Persia and the Maghreb). The others are China, India, Japan, Nusantara (the Malay world), Polynesia, the West African Sahel, Ethiopia, the Swahili coast, Southern Africa, the Inuit, the Mexica and the Inca. What one member knew stays known to its community unless the record shows it was forgotten, and what never spread beyond its finders, like the Norse Vinland, reaches the rest only as a rumour. No viewpoint ends: after conquest or colonial rule, a viewpoint follows its own people’s knowledge, written by scholars such as the Nahua authors of the Florentine Codex or the Andean chronicler Guamán Poma.'),
        ),
        h(
          'p',
          t('The Humanity layer is different: it shows when modern humans first arrived. We say “first known to” a viewpoint, never “discovered”. Someone was usually already there.'),
        ),
        h('h3.card-h', t('Keys')),
        h(
          'dl.keys',
          [
            ['← →', 'Previous / next key moment, or journey stop'],
            ['Shift ← →', 'One year back / forward'],
            ['Space', 'Play or pause'],
            ['/', 'Search'],
            ['Esc', 'Close cards'],
          ].map(([k, v]) => [h('dt', h('kbd', k)), h('dd', t(v))]),
        ),
        h('h3.card-h', t('Sources and accuracy')),
        h(
          'p',
          t('This first version holds {counts}. Every knowledge change, journey stop, city date and invention carries a source and a confidence rating, shown on its card. Dates are approximate until each viewpoint has been reviewed by a specialist; Polynesian dates in particular come from archaeology and genetics and carry wide ranges. The basemap is Natural Earth (public domain).', {counts}),
        ),
        h('h3.card-h', t('Pictures')),
        h(
          'p',
          t('The sketches of cities and journeys are imagined: drawn by an image model from a sourced description of each era or scene, in the manner of an explorer’s sketchbook. They are illustrations, not period artworks.'),
        ),
      ),
    );
    this.el.hidden = true;
  }

  update(s: State) {
    this.el.hidden = s.panel !== 'about';
  }
}
