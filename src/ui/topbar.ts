import type {AppData} from '../data';
import {homeAt} from '../data';
import type {State, Store} from '../state';
import {getLang, t, tx} from '../i18n';
import {formatYear} from '../time';
import type {VpId} from '../types';
import {ALL_VPS} from '../types';
import {h, setIcon} from './dom';
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
    private onLang: () => void,
  ) {
    const chips = ALL_VPS.map(id => {
      const vp = data.vp[id];
      const b = h(
        'button.vp-chip',
        {
          type: 'button',
          'data-vp': id,
          style: `--chip:${vp.color}`,
          title: vp.special ? t('Humanity: when people first arrived') : t('What {vp} knew', {vp: tx.viewpoint(id, 'longName', vp.longName)}),
          onclick: () => this.pick(id),
        },
        h('span.vp-seal', {html: sealSvg(vp.seal, vp.color, 16)}),
        h('span.vp-name', tx.viewpoint(id, 'name', vp.name)),
      );
      this.chips.set(id, b);
      return b;
    });
    this.compareBtn = h(
      'button.vp-chip.vp-compare',
      {type: 'button', title: t('Compare two viewpoints'), onclick: () => this.toggleCompare()},
      h('span.vp-seal', {html: icons.compare}),
      h('span.vp-name', t('Compare')),
    );
    this.globeBtn = h('button.tool', {
      type: 'button',
      title: t('Globe view'),
      'aria-label': t('Toggle globe view'),
      onclick: () => store.set({globe: !store.state.globe}),
    });
    this.subtitle = h('div.cartouche-sub');
    this.note = h('div.cartouche-note');
    this.el = h(
      'header.topbar',
      h(
        'div.cartouche.panel',
        h('h1.cartouche-title', t('The World We Know')),
        this.subtitle,
        this.note,
      ),
      h('nav.switcher.panel', {'aria-label': t('Viewpoint')}, h('div.switcher-chips', chips), h('span.switcher-rule'), this.compareBtn),
      h(
        'div.tools',
        h('button.tool.tool-wide', {type: 'button', title: t('Journeys and inventions'), onclick: () => this.togglePanel('journeys')}, h('span.tool-icon', {html: icons.compass}), h('span.tool-label', t('Journeys'))),
        h('button.tool', {type: 'button', title: t('Search  /'), 'aria-label': t('Search'), onclick: () => store.set({search: true}), html: icons.search}),
        this.globeBtn,
        h(
          'button.tool.tool-lang',
          {type: 'button', title: getLang() === 'zh' ? 'English' : '中文', 'aria-label': getLang() === 'zh' ? 'Switch to English' : '切换到中文', onclick: () => this.onLang()},
          getLang() === 'zh' ? 'EN' : '中',
        ),
        h('button.tool', {type: 'button', title: t('About this atlas'), 'aria-label': t('About'), onclick: () => this.togglePanel('about'), html: icons.info}),
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
    setIcon(this.globeBtn, s.globe ? icons.flat : icons.globe);
    this.globeBtn.title = s.globe ? t('Flat map') : t('Globe view');
    const vps = s.vps.map(v => this.data.vp[v]);
    const year = formatYear(s.year);
    if (s.compare && vps.length === 2) {
      this.subtitle.innerHTML = '';
      this.subtitle.append(
        h('span.sub-vp', {style: `color:${vps[0].color}`}, tx.viewpoint(vps[0].id, 'name', vps[0].name)),
        h('span.sub-amp', getLang() === 'zh' ? ' 与 ' : ' & '),
        h('span.sub-vp', {style: `color:${vps[1].color}`}, tx.viewpoint(vps[1].id, 'name', vps[1].name)),
        h('span.sub-dot', ' · '),
        year,
      );
    } else {
      const vp = vps[0];
      const home = homeAt(vp, s.year);
      this.subtitle.innerHTML = '';
      const who = h('span.sub-vp', {style: `color:${vp.color}`}, vp.special ? t('people') : tx.viewpoint(vp.id, 'longName', vp.longName));
      const place = vp.special ? '' : `${tx.name(home.place)}${getLang() === 'zh' ? '，' : ', '}`;
      if (getLang() === 'zh') this.subtitle.append(who, vp.special ? '所及' : '所知', h('span.sub-dot', ' · '), place, year);
      else this.subtitle.append(vp.special ? 'as reached by ' : 'as known to ', who, h('span.sub-dot', ' · '), place, year);
    }
    const vp = vps[0];
    const showNote =
      !s.compare &&
      vp.startNote &&
      ((vp.id === 'islam' && s.year < 622) || vp.id === 'polynesia' || (vp.id === 'humanity' && s.year < 1500));
    this.note.textContent = showNote ? tx.viewpoint(vp.id, 'startNote', vp.startNote!) : '';
    this.note.hidden = !showNote;
  }
}
