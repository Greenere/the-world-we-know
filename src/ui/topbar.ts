import type {AppData} from '../data';
import {homeAt} from '../data';
import type {State, Store} from '../state';
import {getLang, t, tx} from '../i18n';
import {formatYear, START} from '../time';
import type {VpId} from '../types';
import {ALL_VPS} from '../types';
import {h, setIcon} from './dom';
import {icons, livingIcons, sealSvg} from './icons';
import {REPO_URL} from './correction';

/** The viewpoints always in the bar; the others are a tap away in the picker, and join the bar while chosen. */
const FEATURED: VpId[] = ['europe', 'china', 'humanity'];

/** The picker's groups: the knowledge communities that span many lands, then each viewpoint by where its home was. */
export const GROUPS: [string, VpId[]][] = [
  ['Knowledge communities', ['europe', 'islam', 'humanity']],
  ['Europe', ['greece', 'rome', 'iberia', 'france', 'britain', 'germany', 'norse', 'russia']],
  ['Asia', ['steppe', 'india', 'china', 'korea', 'japan', 'nusantara']],
  ['The Middle East', ['arabia', 'persia', 'egypt', 'turks']],
  ['Africa', ['maghreb', 'sahel', 'ethiopia', 'swahili', 'kongo', 'zimbabwe']],
  ['The Americas and the Arctic', ['inuit', 'haudenosaunee', 'mississippian', 'mexica', 'maya', 'inca']],
  ['Oceania', ['polynesia']],
];

/** The picker's columns, by group index, chosen so the four come out about the same height. */
const PICKER_COLUMNS = [[0, 2], [1], [3, 4], [5, 6]];

/** The second line of a picker entry: who is in a knowledge community, or which one a viewpoint joins. */
function pickerLine(data: AppData, id: VpId): string {
  const vp = data.vp[id];
  const name = (v: VpId) => tx.viewpoint(v, 'name', data.vp[v].name);
  if (vp.community) return t('Shared by {members}', {members: vp.community.members.map(m => name(m.viewpoint)).join(t(', '))});
  if (vp.special) return t('When people first arrived');
  // The long name only when it says more than the name (not "India / India").
  const same = vp.longName.replace(/^The /, '').toLowerCase() === vp.name.toLowerCase();
  const long = same ? '' : tx.viewpoint(id, 'longName', vp.longName);
  // Every community it belonged to, in order: Egypt is part of Europe from 331 BCE to 641, then of the Islamic world.
  const spans = memberships(data, id);
  if (!spans.length) return long;
  const joined = spans.join(t('; '));
  return long ? `${long} · ${joined}` : joined.charAt(0).toUpperCase() + joined.slice(1);
}

/** Every community a viewpoint belonged to, in order: Egypt is part of Europe from 331 BCE to 641, then of the Islamic world. */
function memberships(data: AppData, id: VpId): string[] {
  return ALL_VPS.flatMap(c => (data.vp[c].community?.members ?? []).filter(m => m.viewpoint === id).map(m => ({c, ...m})))
    .sort((a, b) => a.from - b.from)
    .map(({c, from, until}) => {
      const community = tx.viewpoint(c, 'longName', data.vp[c].longName);
      if (until !== undefined) return t('part of {community} {from}–{until}', {community, from: formatYear(from), until: formatYear(until)});
      return from <= START ? t('part of {community} from the start', {community}) : t('joins {community} in {year}', {community, year: formatYear(from)});
    });
}

export class TopBar {
  el: HTMLElement;
  private chips = new Map<VpId, HTMLButtonElement>();
  private compareBtn: HTMLButtonElement;
  private globeBtn: HTMLButtonElement;
  /** The left panel's two faces: where people went, and what they came to know that travelled. */
  private journeysBtn: HTMLButtonElement;
  private discoveriesBtn: HTMLButtonElement;
  /** A viewpoint's note for its early years, as a slip under the title row while it applies. */
  private note: HTMLElement;
  private moreBtn: HTMLButtonElement;
  private picker: HTMLElement;
  private pickerItems = new Map<VpId, HTMLButtonElement>();

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
    this.picker = h(
      'div.vp-picker.panel',
      {role: 'dialog', 'aria-label': t('All viewpoints')},
      PICKER_COLUMNS.map(col => h('div.vp-picker-col', col.map(gi => GROUPS[gi]).map(([title, ids]) =>
        h(
          'section.vp-picker-group',
          h('h3.card-h', t(title)),
          ids.map(id => {
            const vp = data.vp[id];
            const b = h(
              'button.vp-picker-item',
              {type: 'button', style: `--chip:${vp.color}`, title: [pickerLine(data, id), tx.viewpoint(id, 'longName', vp.longName)].filter((x, i, a) => x && a.indexOf(x) === i).join('\n'), onclick: () => {
                this.pick(id);
                this.closePicker();
              }},
              h('span.vp-seal', {html: sealSvg(vp.seal, vp.color, 22)}),
              h(
                'span.vp-picker-text',
                h('span.vp-picker-name', tx.viewpoint(id, 'name', vp.name)),
                h('span.vp-picker-long', tx.viewpoint(id, 'tagline', vp.tagline)),
              ),
            );
            this.pickerItems.set(id, b);
            return b;
          }),
        ),
      ))),
    );
    this.picker.hidden = true;
    this.moreBtn = h(
      'button.vp-chip.vp-more',
      {type: 'button', title: t('More viewpoints'), 'aria-haspopup': 'dialog', 'aria-expanded': 'false', onclick: (e: Event) => {
        e.stopPropagation();
        if (this.picker.hidden) this.openPicker();
        else this.closePicker();
      }},
      h('span.vp-seal', {html: icons.more}),
      h('span.vp-name', t('More')),
    );
    requestAnimationFrame(() => this.watchHeight());
    document.addEventListener('click', e => {
      if (!this.picker.hidden && !this.picker.contains(e.target as Node)) this.closePicker();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !this.picker.hidden) {
        e.stopPropagation();
        this.closePicker();
      }
    }, true);
    this.compareBtn = h(
      'button.vp-chip.vp-compare',
      {type: 'button', title: t('Compare two viewpoints'), onclick: () => this.toggleCompare()},
      h('span.vp-seal', {html: icons.compare}),
      h('span.vp-name', t('Compare')),
    );
    this.journeysBtn = h(
      'button.tool.tool-wide',
      {type: 'button', title: t('Journeys and landmarks'), onclick: () => this.togglePanel('journeys')},
      h('span.tool-icon', {html: icons.compass}),
      h('span.tool-label', t('Journeys')),
    );
    this.discoveriesBtn = h(
      'button.tool.tool-wide',
      {type: 'button', title: t('Inventions, books, plants and animals'), onclick: () => this.togglePanel('discoveries')},
      h('span.tool-icon', {html: livingIcons.plant}),
      h('span.tool-label', t('Discoveries')),
    );
    this.globeBtn = h('button.tool', {
      type: 'button',
      title: t('Globe view'),
      'aria-label': t('Toggle globe view'),
      onclick: () => store.set({globe: !store.state.globe}),
    });
    this.note = h('div.cartouche-note.panel');
    const about = h('button.tool', {type: 'button', title: t('About this atlas'), 'aria-label': t('About'), onclick: () => this.togglePanel('about'), html: icons.info});
    const tools = h(
      'div.tools',
      h('button.tool', {type: 'button', title: t('Search  /'), 'aria-label': t('Search'), onclick: () => store.set({search: true}), html: icons.search}),
      this.globeBtn,
      h(
        'button.tool.tool-lang',
        {type: 'button', title: getLang() === 'zh' ? 'English' : '中文', 'aria-label': getLang() === 'zh' ? 'Switch to English' : '切换到中文', onclick: () => this.onLang()},
        getLang() === 'zh' ? 'EN' : '中',
      ),
      // About, which also explains how to read the fog.
      about,
      // Star on GitHub: the source, in a new tab.
      h(
        'a.tool.tool-github',
        {href: REPO_URL, target: '_blank', rel: 'noopener', title: t('Star on GitHub'), 'aria-label': t('Star on GitHub')},
        h('span.tool-icon', {html: icons.github}),
      ),
    );
    // The atlas's name. The year is on the timeline.
    const title = h('div.cartouche.panel', h('span.cartouche-rose', {html: icons.rose}), h('h1.cartouche-title', t('The World We Know')), this.note);
    // Left: the title, then what there is to browse (Journeys and Discoveries open the list panel beneath them).
    // Centre: the viewpoints; the chosen one's tooltip names the home it is seen from. Right: the tools.
    const left = h('div.topbar-left', title);
    const right = h('div.topbar-right', tools);
    this.el = h(
      'header.topbar',
      left,
      h('nav.switcher.panel', {'aria-label': t('Viewpoint')}, h('div.switcher-chips', chips, this.moreBtn), h('span.switcher-rule'), this.compareBtn, this.picker),
      right,
    );
    // On phones the two buttons stay with the other tools, in the row of round buttons.
    const narrow = matchMedia('(max-width: 760px)');
    const place = () => {
      if (narrow.matches) tools.prepend(this.journeysBtn, this.discoveriesBtn);
      else left.append(this.journeysBtn, this.discoveriesBtn);
      this.fitTitle();
    };
    place();
    narrow.addEventListener('change', place);
  }

  /**
   * Tell the side panels where the top bar really ends above each of them (the cartouche can wrap to two lines,
   * and on narrower screens the viewpoint switcher drops to a second row), so they never slide under it.
   */
  private watchHeight() {
    const PANEL = 410; // the side panels' width, with a margin
    const measure = () => {
      const W = innerWidth;
      let left = 0;
      let right = 0;
      for (const child of this.el.children) {
        const r = (child as HTMLElement).getBoundingClientRect();
        if (!r.height || (child as HTMLElement).hidden) continue;
        // The note hangs below the title row.
        const bottom = child.contains(this.note) && !this.note.hidden ? Math.max(r.bottom, this.note.getBoundingClientRect().bottom) : r.bottom;
        if (r.left < PANEL) left = Math.max(left, bottom);
        if (r.right > W - PANEL) right = Math.max(right, bottom);
      }
      const root = document.documentElement.style;
      if (left > 0) root.setProperty('--top-left', `${Math.ceil(left) + 8}px`);
      if (right > 0) root.setProperty('--top-right', `${Math.ceil(right) + 8}px`);
    };
    const ro = new ResizeObserver(() => {
      this.fitTitle();
      measure();
    });
    ro.observe(this.el);
    for (const child of this.el.children) ro.observe(child);
    ro.observe(this.note);
    // The title's words are measured in its own fonts, which may arrive after the first layout.
    document.fonts?.ready.then(() => this.fitTitle());
    addEventListener('resize', measure);
  }

  /**
   * Keep the top bar to one row. When it runs out of room the switcher gives way: first More and Compare go to
   * their marks, then the viewpoints not chosen; only past that does it take a row of its own.
   */
  private fitTitle() {
    const bar = this.el;
    bar.classList.remove('tight', 'tighter', 'stacked');
    const over = () => bar.scrollWidth > bar.clientWidth + 1;
    for (const step of ['tight', 'tighter', 'stacked']) {
      if (!over()) return;
      bar.classList.add(step);
    }
  }

  private openPicker() {
    this.picker.hidden = false;
    this.moreBtn.setAttribute('aria-expanded', 'true');
    this.moreBtn.classList.add('open');
  }

  private closePicker() {
    this.picker.hidden = true;
    this.moreBtn.setAttribute('aria-expanded', 'false');
    this.moreBtn.classList.remove('open');
  }

  private togglePanel(p: 'journeys' | 'discoveries' | 'about') {
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
      // The chosen viewpoint's tooltip says where it looks from: its home in this year.
      const vp = this.data.vp[id];
      const name = tx.viewpoint(id, 'longName', vp.longName);
      b.title = vp.special
        ? t('Humanity: when people first arrived')
        : s.vps.includes(id)
          ? t('What {vp} knew, seen from {place}', {vp: name, place: tx.name(homeAt(vp, s.year).place)})
          : t('What {vp} knew', {vp: name});
      b.classList.toggle('active', s.vps.includes(id));
      b.setAttribute('aria-pressed', String(s.vps.includes(id)));
      b.hidden = !FEATURED.includes(id) && !s.vps.includes(id);
    }
    for (const [id, b] of this.pickerItems) b.classList.toggle('active', s.vps.includes(id));
    this.compareBtn.classList.toggle('active', s.compare);
    // Which face of the left panel is open, for screen readers; the panel itself shows it to the eye.
    for (const [b, p] of [[this.journeysBtn, 'journeys'], [this.discoveriesBtn, 'discoveries']] as const) b.setAttribute('aria-expanded', String(s.panel === p));
    setIcon(this.globeBtn, s.globe ? icons.flat : icons.globe);
    this.globeBtn.title = s.globe ? t('Flat map') : t('Globe view');
    const vps = s.vps.map(v => this.data.vp[v]);
    const vp = vps[0];
    const showNote =
      !s.compare &&
      vp.startNote &&
      ((vp.community && s.year < Math.min(...vp.community.members.map(m => m.from))) ||
        (vp.noteUntil !== undefined && s.year < vp.noteUntil) ||
        vp.id === 'polynesia' ||
        (vp.id === 'humanity' && s.year < 1500));
    this.note.textContent = showNote ? tx.viewpoint(vp.id, 'startNote', vp.startNote!) : '';
    this.note.hidden = !showNote;
  }
}
