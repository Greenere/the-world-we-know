import type {AppData} from '../data';
import {homeAt} from '../data';
import type {State, Store} from '../state';
import {formatYear} from '../time';
import type {VpId} from '../types';
import {ALL_VPS} from '../types';
import {h} from './dom';
import {icons, sealSvg} from './icons';

export class TopBar {
  el: HTMLElement;
  private chips = new Map<VpId, HTMLButtonElement>();
  private compareBtn: HTMLButtonElement;
  private globeBtn: HTMLButtonElement;
  private subtitle: HTMLElement;
  private note: HTMLElement;

  constructor(
    private data: AppData,
    private store: Store,
  ) {
    const chips = ALL_VPS.map(id => {
      const vp = data.vp[id];
      const b = h(
        'button.vp-chip',
        {
          type: 'button',
          'data-vp': id,
          style: `--chip:${vp.color}`,
          title: vp.special ? 'Humanity: when people first arrived' : `What ${vp.longName} knew`,
          onclick: () => this.pick(id),
        },
        h('span.vp-seal', {html: sealSvg(vp.seal, vp.color, 16)}),
        h('span.vp-name', vp.name),
      );
      this.chips.set(id, b);
      return b;
    });
    this.compareBtn = h(
      'button.vp-chip.vp-compare',
      {type: 'button', title: 'Compare two viewpoints', onclick: () => this.toggleCompare()},
      h('span.vp-seal', {html: icons.compare}),
      h('span.vp-name', 'Compare'),
    );
    this.globeBtn = h('button.tool', {
      type: 'button',
      title: 'Globe view',
      'aria-label': 'Toggle globe view',
      onclick: () => store.set({globe: !store.state.globe}),
    });
    this.subtitle = h('div.cartouche-sub');
    this.note = h('div.cartouche-note');
    this.el = h(
      'header.topbar',
      h(
        'div.cartouche.panel',
        h('h1.cartouche-title', 'The World We Know'),
        this.subtitle,
        this.note,
      ),
      h('nav.switcher.panel', {'aria-label': 'Viewpoint'}, h('div.switcher-chips', chips), h('span.switcher-rule'), this.compareBtn),
      h(
        'div.tools',
        h('button.tool.tool-wide', {type: 'button', title: 'Journeys and inventions', onclick: () => this.togglePanel('journeys')}, h('span.tool-icon', {html: icons.compass}), h('span.tool-label', 'Journeys')),
        h('button.tool', {type: 'button', title: 'Search  /', 'aria-label': 'Search', onclick: () => store.set({search: true}), html: icons.search}),
        this.globeBtn,
        h('button.tool', {type: 'button', title: 'About this atlas', 'aria-label': 'About', onclick: () => this.togglePanel('about'), html: icons.info}),
      ),
    );
  }

  private togglePanel(p: 'journeys' | 'about') {
    this.store.set({panel: this.store.state.panel === p ? 'none' : p});
  }

  private pick(id: VpId) {
    const s = this.store.state;
    if (!s.compare) {
      this.store.set({vps: [id]});
      return;
    }
    let vps = s.vps.includes(id) ? s.vps.filter(v => v !== id) : [...s.vps, id];
    if (vps.length > 2) vps = vps.slice(-2);
    if (vps.length === 0) vps = [id];
    this.store.set({vps});
  }

  private toggleCompare() {
    const s = this.store.state;
    if (s.compare) {
      this.store.set({compare: false, vps: [s.vps[0]]});
    } else {
      const other = s.vps[0] === 'china' ? 'europe' : 'china';
      this.store.set({compare: true, vps: [s.vps[0], other], journey: null});
    }
  }

  update(s: State) {
    for (const [id, b] of this.chips) {
      b.classList.toggle('active', s.vps.includes(id));
      b.setAttribute('aria-pressed', String(s.vps.includes(id)));
    }
    this.compareBtn.classList.toggle('active', s.compare);
    this.globeBtn.innerHTML = s.globe ? icons.flat : icons.globe;
    this.globeBtn.title = s.globe ? 'Flat map' : 'Globe view';
    const vps = s.vps.map(v => this.data.vp[v]);
    const year = formatYear(s.year);
    if (s.compare && vps.length === 2) {
      this.subtitle.innerHTML = '';
      this.subtitle.append(
        h('span.sub-vp', {style: `color:${vps[0].color}`}, vps[0].name),
        h('span.sub-amp', ' & '),
        h('span.sub-vp', {style: `color:${vps[1].color}`}, vps[1].name),
        h('span.sub-dot', ' · '),
        year,
      );
    } else {
      const vp = vps[0];
      const home = homeAt(vp, s.year);
      this.subtitle.innerHTML = '';
      this.subtitle.append(
        vp.special ? 'as reached by ' : 'as known to ',
        h('span.sub-vp', {style: `color:${vp.color}`}, vp.special ? 'people' : vp.longName),
        h('span.sub-dot', ' · '),
        vp.special ? '' : `${home.place}, `,
        year,
      );
    }
    const vp = vps[0];
    const showNote =
      !s.compare &&
      vp.startNote &&
      ((vp.id === 'islam' && s.year < 622) || vp.id === 'polynesia' || (vp.id === 'humanity' && s.year < 1500));
    this.note.textContent = showNote ? vp.startNote! : '';
    this.note.hidden = !showNote;
  }
}
