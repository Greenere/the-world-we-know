import '@fontsource/eb-garamond/400.css';
import '@fontsource/eb-garamond/400-italic.css';
import '@fontsource/eb-garamond/500.css';
import '@fontsource/eb-garamond/600.css';
import '@fontsource/im-fell-english/400.css';
import '@fontsource/im-fell-english/400-italic.css';
import '@fontsource/im-fell-english-sc/400.css';
import '@fontsource/noto-serif-sc/400.css';
import '@fontsource/noto-serif-sc/600.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';

import {MapboxOverlay} from '@deck.gl/mapbox';
import {type IControl, type Map as MlMap, type MapLayerMouseEvent, Marker} from 'maplibre-gl';
import type {AppData} from './data';
import {bookShelf, homeAt, loadBooks, loadData, loadZh} from './data';
import {getLang, initialLang, isZh, type Lang, rememberLang, setLang, t, tx} from './i18n';
import {FogField} from './fog/field';
import {buildGrid, cellAt, type Grid} from './fog/grid';
import type {FogLayerUniforms} from './fog/layer';
import type {JourneyGeo} from './journey-geo';
import {atYear, buildJourneyGeo, km, legDuration, placeAt, progressForYear, span, stepCount, travelled, yearAt} from './journey-geo';
import {createMap} from './map/basemap';
import {type CityView, cityStatus, clampLat, type InventionView, type LivingPoint, OverlayModel, type RouteView, type Traveller} from './map/overlay';
import {WideningFrame} from './map/widen';
import {Sight} from './sight';
import {DEFAULT_STATE, isListPanel, type ListPanel, readUrl, type Shelf, SHELVES, type State, Store, writeUrl} from './state';
import {formatRange, formatYear, PRESENT, START} from './time';
import type {Living, SearchEntry, VpId} from './types';
import {About} from './ui/about';
import {Cards, type JourneyAt, levelName} from './ui/cards';
import {JourneyCard} from './ui/journey-card';
import {hexToRgb, mixHex, rgb01} from './ui/color';
import {h} from './ui/dom';
import {sealSvg} from './ui/icons';
import {Inset} from './ui/inset';
import {JourneyPanel} from './ui/journey-panel';
import {Search} from './ui/search';
import {momentsFor, scaleFor, Timeline} from './ui/timeline';
import {TopBar} from './ui/topbar';

const PAPER_FOG = '#efe7d3';
/** A year on the timeline's scale. */
const clampYear = (y: number) => Math.max(START, Math.min(PRESENT, Math.round(y)));
const PICKABLE = ['others', 'routes', 'living-points', 'inventions', 'inventions-globe', 'cities', 'cities-globe', 'journey-stops'];
const EDGE = '#8a6a43';
const HIGHLIGHT = '#9b2f20';
/** Seconds to play the whole timeline at 1×. */
const PLAY_SECONDS = 150;
/** Journey pace is measured against the average 1× rate: about 17 years a second. */
const YEARS_PER_SECOND = 2526 / PLAY_SECONDS;
/** Years a finished journey's trail lingers during playback. */
const FADE_YEARS = 0.4;
/** Contemporaries closer than this to the followed traveller are named on the map. */
const NEAR_KM = 1500;

/**
 * The Chinese font comes in many small slices, fetched only for characters in use. The map's labels are drawn
 * into a texture once, so every character they can show must be loaded first, or it would be drawn blank.
 */
async function zhFontsReady(chars: string) {
  const sample = `我们所知的世界欧洲中国伊斯兰波利尼西亚人类地图旅程发明年公元前${chars}`;
  await Promise.race([
    Promise.all(['16px "Noto Serif SC"', '600 16px "Noto Serif SC"'].map(f => document.fonts.load(f, sample))),
    new Promise(r => setTimeout(r, 6000)),
  ]);
}

async function fontsReady() {
  const wanted = ['16px "IM Fell English"', 'italic 16px "IM Fell English"', '16px "IM Fell English SC"', '16px "EB Garamond"'];
  await Promise.race([Promise.all(wanted.map(f => document.fonts.load(f))), new Promise(r => setTimeout(r, 2500))]);
}

class App {
  store: Store;
  field: FogField;
  map: MlMap;
  overlay: MapboxOverlay;
  model: OverlayModel;
  geoCache = new Map<string, JourneyGeo>();
  seals: Marker[] = [];
  ui: {
    top: TopBar;
    timeline: Timeline;
    cards: Cards;
    journeyCard: JourneyCard;
    journey: JourneyPanel;
    search: Search;
    inset: Inset;
    about: About;
  };
  tip: HTMLElement;
  private labelCanvas: HTMLCanvasElement;
  private fogKey = '';
  private tau = 0.3;
  private needsLayers = true;
  private last = performance.now();
  private travelTarget: number | null = null;
  /** A journey opened from the journey list goes back to that list when it is closed. */
  /** The list a journey was opened from, to return to when it closes. */
  private backToList: ListPanel | null = null;
  /** The list each face of the left panel last showed, so switching faces brings it back. */
  private lastShelf: Record<ListPanel, Shelf> = {journeys: 'journeys', discoveries: 'inventions'};
  private dwell = 0;
  private sightCache = new Map<string, Sight>();
  /** Follow camera: paused while the reader drags the map, resumed when the traveller moves. */
  private followPaused = false;
  /** The journey was paused because a card opened while it played; closing that card carries on. */
  private heldForCard = false;
  /** Until when our own camera flight runs; per-frame following waits for it. */
  private flightUntil = 0;
  private urlTimer = 0;
  private uiNodes: HTMLElement[] = [];
  private highlightFor: number | null = null;
  private highlightMask: Uint8Array | null = null;
  /** The auto camera on the timeline: frames what the viewpoint knows and widens with it. */
  private widen: WideningFrame;

  /** A region and every region inside it, by index: so Africa outlines the whole continent. */
  private regionMask(id: string): Uint8Array {
    const mask = new Uint8Array(this.data.regions.length);
    this.data.regions.forEach((r, i) => {
      if (r.id === id || r.within?.includes(id)) mask[i] = 1;
    });
    return mask;
  }

  constructor(
    private data: AppData,
    private grid: Grid,
  ) {
    this.field = new FogField(grid, data.fog);
    this.store = new Store(this.initialState(), (n, p) => this.normalize(n, p));
    const s = this.store.state;
    const home = homeAt(data.vp[s.vps[0]], s.year);
    this.map = createMap(document.getElementById('map')!, [home.lon, Math.max(-50, Math.min(55, home.lat - 6))], initialZoom(), s.globe);
    this.overlay = new MapboxOverlay({interleaved: false, layers: []});
    this.map.addControl(this.overlay as unknown as IControl);
    this.model = new OverlayModel({data, grid, field: this.field, map: this.map});
    this.widen = new WideningFrame(grid, this.field, this.map);

    this.ui = this.buildUi();
    this.tip = h('div.hover-tip');
    this.labelCanvas = h('canvas.label-canvas', {'aria-hidden': 'true'});
    document.getElementById('map')!.after(this.labelCanvas);
    document.getElementById('app')!.append(this.tip);

    this.store.subscribe((n, p) => this.onChange(n, p));
    this.bindMap();
    this.bindKeys();
    this.onChange(this.store.state, {...this.store.state, vps: [], year: NaN});
    this.field.snap();
    this.applyStartLinks();
    requestAnimationFrame(t => this.frame(t));
  }

  /** The panels around the map. Built again when the language changes; the map itself stays. */
  private buildUi(): App['ui'] {
    const data = this.data;
    const actions = {
      openRegion: (id: string) => this.openRegion(id, true),
      openJourney: (id: string, at?: JourneyAt) => this.openJourneyAt(id, at),
      openInvention: (id: string) => this.openInvention(id),
      openBook: (id: string) => void this.openBook(id),
      showRegionAs: (vp: VpId | '*', region: string, year: number) => this.showRegionAs(vp, region, year),
      openLiving: (id: string, year?: number) => this.openLiving(id, year),
      pickArrival: (i: number) => this.pickArrival(i),
      openCity: (id: string, fly = false) => this.openCity(id, fly),
      landmarkNeighbors: (id: string) => this.ui.journey.landmarkNeighbors(id),
      openLandmark: (id: string) => this.ui.journey.openLandmark(id),
      flyTo: (lng: number, lat: number, zoom?: number) => this.map.flyTo({center: [lng, lat], zoom: zoom ?? this.map.getZoom()}),
    };
    const ui: App['ui'] = {
      top: new TopBar(data, this.store, () => this.setLanguage(isZh() ? 'en' : 'zh')),
      timeline: new Timeline(data, this.store, d => this.step(d), id => this.openInvention(id), id => this.ui.journey.openEra(id), id => this.startJourney(id)),
      cards: new Cards(data, this.store, this.field, actions),
      journey: new JourneyPanel(data, this.store, this.field, {
        start: id => this.startJourney(id),
        openInvention: id => this.openInvention(id),
        openBook: id => void this.openBook(id),
        openLiving: id => this.openLiving(id),
        openCity: id => this.openCity(id, true),
      }),
      journeyCard: new JourneyCard(
        data,
        this.store,
        {
          step: d => this.step(d),
          close: () => this.closeJourney(),
          recenter: () => {
            this.followPaused = false;
            const g = this.geo(this.store.state.journey);
            if (g) this.followCamera(this.store.state, g, true);
          },
          switchTo: (id, year) => this.startJourney(id, year),
          openCity: id => this.openCity(id, true),
          openRegion: id => this.openRegion(id, true),
          unfold: () => ui.cards.close(),
          showSketch: i => {
            this.travelTarget = null;
            this.store.set({progress: i, playing: false, details: false, city: null, region: null, regionCell: null, invention: null, book: null, living: null});
          },
          jumpTo: year => {
            const g = this.geo(this.store.state.journey);
            if (!g) return;
            this.travelTarget = null;
            this.store.set({progress: progressForYear(g, year, false), playing: false});
          },
        },
        (j, shown) => ui.cards.scenePlate(j, shown),
      ),
      search: new Search(data, this.store, e => this.choose(e)),
      inset: new Inset(data),
      about: new About(data, this.store),
    };
    this.uiNodes = [
      ui.top.el,
      ui.journey.el,
      // The cards on the right: the journey being followed, and under it whatever was opened on the map.
      h('div.card-stack', ui.journeyCard.el, ui.cards.el),
      h('div.bottom-right', ui.inset.el),
      ui.timeline.el,
      ui.search.el,
      ui.about.el,
    ];
    document.getElementById('app')!.prepend(...this.uiNodes);
    return ui;
  }

  /** Switch the interface and the map's labels between English and Chinese, keeping everything else. */
  async setLanguage(l: Lang) {
    if (l === getLang()) return;
    const content = l === 'zh' ? await loadZh(this.data) : null;
    if (l === 'zh' && !content) return;
    if (l === 'zh') await zhFontsReady(content!.chars);
    setLang(l, content);
    rememberLang(l);
    for (const n of this.uiNodes) n.remove();
    this.ui = this.buildUi();
    this.model.relabel();
    const s = this.store.state;
    this.onChange(s, {...s, vps: [], year: NaN});
    this.needsLayers = true;
  }

  // ── State ────────────────────────────────────────────────────────────────

  private initialState(): State {
    const url = readUrl();
    const s: State = {...DEFAULT_STATE, ...url};
    if (s.journey && !this.data.journeyById.has(s.journey)) s.journey = null;
    if (s.city && !this.data.cityById.has(s.city)) s.city = null;
    if (s.region && !this.data.regionById.has(s.region)) s.region = null;
    if (s.invention && !this.data.inventionById.has(s.invention)) s.invention = null;
    if (s.invention && url.year === undefined && !s.journey) s.year = this.data.inventionById.get(s.invention)!.mid;
    // A book is known from its source until the shelf loads; a work opens at the year it was written.
    const book = s.book ? this.data.sources[s.book] : undefined;
    if (s.book && book?.kind !== 'work' && book?.kind !== 'study') s.book = null;
    if (s.book && book?.kind === 'work' && book.year !== undefined && url.year === undefined && !s.journey) s.year = clampYear(book.year);
    if (s.living && !this.data.livingById.has(s.living)) s.living = null;
    if (s.living && url.year === undefined && !s.journey) s.year = this.livingYear(this.data.livingById.get(s.living)!, s.vps[0]);
    if (s.journey) {
      const g = this.geo(s.journey)!;
      if (!url.vps) s.vps = [g.journey.viewpoint];
      s.compare = false;
      s.progress = Math.min(stepCount(g) - 1, (url.stop ?? 1) - 1);
      s.year = yearAt(g, s.progress);
      if (g.journey.globe && url.globe === undefined) s.globe = true;
    }
    if (s.region) s.regionCell = this.labelCell(s.region);
    return s;
  }

  private normalize(n: State, p: State): State {
    // Each face of the left panel shows one of its own lists: the last one it showed.
    if (isListPanel(n.panel)) {
      const own: readonly Shelf[] = SHELVES[n.panel];
      if (!own.includes(n.shelf)) n.shelf = this.lastShelf[n.panel];
      this.lastShelf[n.panel] = n.shelf;
    }
    // One card at a time: an invention, a book, a plant or animal, a city or a region.
    if (n.invention && n.invention !== p.invention) {
      n.city = null;
      n.region = null;
      n.regionCell = null;
      n.book = null;
      n.living = null;
    } else if (n.book && n.book !== p.book) {
      n.city = null;
      n.region = null;
      n.regionCell = null;
      n.invention = null;
      n.living = null;
    } else if (n.living && n.living !== p.living) {
      n.city = null;
      n.region = null;
      n.regionCell = null;
      n.invention = null;
      n.book = null;
    } else if ((n.city && n.city !== p.city) || (n.region && n.region !== p.region)) {
      n.invention = null;
      n.book = null;
      n.living = null;
    }
    // A place picked on one plant or animal's way means nothing for another.
    if (n.living !== p.living) n.arrival = null;
    if (n.journey) {
      const g = this.geo(n.journey)!;
      const max = stepCount(g) - 1;
      if (n.progress !== p.progress || n.journey !== p.journey) {
        n.progress = Math.max(0, Math.min(max, n.progress));
        n.year = yearAt(g, n.progress);
      } else if (n.year !== p.year) {
        n.progress = progressForYear(g, n.year);
      }
    }
    if (!n.compare && n.vps.length > 1) n.vps = [n.vps[0]];
    const sc = scaleFor(n);
    n.year = Math.max(sc.min, Math.min(sc.max, n.year));
    return n;
  }

  geo(id: string | null): JourneyGeo | null {
    if (!id) return null;
    let g = this.geoCache.get(id);
    if (!g) {
      const j = this.data.journeyById.get(id);
      if (!j) return null;
      g = buildJourneyGeo(j);
      this.geoCache.set(id, g);
    }
    return g;
  }

  private onChange(s: State, p: State) {
    const geo = this.geo(s.journey);
    this.holdForReading(s, p);
    this.ui.top.update(s);
    this.ui.timeline.update(s, geo);
    // The journey card first: it measures itself to fold, before the card opening below takes room from it.
    this.ui.journeyCard.update(s, geo, !!(s.city || s.region || s.invention || s.book || s.living));
    this.ui.cards.update(s);
    this.ui.journey.update(s);
    this.ui.search.update(s);
    this.ui.about.update(s);
    this.ui.inset.update(s, geo, performance.now());
    document.documentElement.style.setProperty('--vp', this.data.vp[s.vps[0]].color);
    document.body.classList.toggle('has-journey', !!s.journey || isListPanel(s.panel));

    if (s.vps.join() !== p.vps.join()) {
      this.tau = 0.5;
      this.updateSeals(s);
      if (!s.journey && p.vps.length && s.vps.length === 1 && !s.compare) this.ensureHomeVisible(s);
    } else if (s.scrubbing) {
      this.tau = 0.1;
    } else {
      this.tau = s.playing ? 0.22 : 0.3;
    }
    if (homeAt(this.data.vp[s.vps[0]], s.year) !== homeAt(this.data.vp[s.vps[0]], p.year) || s.vps.join() !== p.vps.join()) this.updateSeals(s);
    if (s.globe !== p.globe) this.setProjection(s.globe);
    if (s.journey !== p.journey) {
      this.followPaused = false;
      if (!s.journey) this.map.easeTo({padding: {top: 0, bottom: 0, left: 0, right: 0}, duration: 600});
    }
    if (s.progress !== p.progress || (s.playing && !p.playing)) this.followPaused = false;
    if (s.journey && s.journey === p.journey && s.follow !== p.follow) {
      this.followPaused = false;
      const g = this.geo(s.journey)!;
      if (s.follow) this.followCamera(s, g, true);
      else this.fitJourney(g);
    }
    // The auto camera frames afresh (closing in if need be) when turned on, on play, on a new viewpoint and
    // when the reader moves the year; while playing it only widens.
    const jumped = !s.playing && !s.scrubbing && s.year !== p.year;
    if (s.autoCamera && (!p.autoCamera || (s.playing && !p.playing) || s.vps.join() !== p.vps.join() || jumped || (p.scrubbing && !s.scrubbing))) {
      this.widen.reset();
    }
    if (s.playing && !p.playing) {
      this.dwell = 0;
      if (s.journey) {
        const g = this.geo(s.journey)!;
        if (s.progress >= stepCount(g) - 1) this.store.set({progress: 0});
      } else if (s.year >= scaleFor(s).max - 0.5) {
        this.store.set({year: scaleFor(s).min});
      }
    }
    if (!s.playing) this.travelTarget = this.travelTarget !== null && p.playing ? null : this.travelTarget;
    this.needsLayers = true;
    this.scheduleUrl();
  }

  private scheduleUrl() {
    clearTimeout(this.urlTimer);
    this.urlTimer = window.setTimeout(() => {
      const s = this.store.state;
      const g = this.geo(s.journey);
      writeUrl(s, g ? Math.min(g.stops.length, Math.round(s.progress)) : null);
    }, 250);
  }

  // ── Frame loop: playback, fog easing, layers ─────────────────────────────

  private frame(now: number) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const s = this.store.state;
    const geo = this.geo(s.journey);

    if (s.playing || this.travelTarget !== null) this.advance(dt, s, geo);

    const st = this.store.state;
    const highlight = st.region ? this.data.regionIndex.get(st.region) ?? null : null;
    if (highlight !== this.highlightFor) {
      this.highlightFor = highlight;
      this.highlightMask = highlight === null ? null : this.regionMask(st.region!);
    }
    const sight = geo ? this.sight(geo) : null;
    const fogKey = `${st.vps.join()}|${Math.round(st.year * 2)}|${highlight}|${st.journey}|${geo ? Math.round(st.progress * 40) : 0}`;
    let seen: Float32Array | null = null;
    if (fogKey !== this.fogKey) {
      this.fogKey = fogKey;
      seen = sight ? sight.at(st.progress) : null;
      this.field.setView(st.vps, st.year, this.highlightMask, new Set(this.data.viewpoints.filter(v => v.oral).map(v => v.id)), seen);
    }
    const fogChanged = this.field.step(dt, this.tau);
    const visChanged = this.model.updateVisibility(st, now, sight ? sight.seen : null);
    const journeyCities = new Set<string>();
    if (geo) for (const x of geo.stops) if (x.stop.city) journeyCities.add(x.stop.city);
    const home = homeAt(this.data.vp[st.vps[0]], st.year);
    const homeCity = this.data.cities.find(c => Math.abs(c.lat - home.lat) < 0.3 && Math.abs(c.lon - home.lon) < 0.3)?.id ?? null;
    // The globe paints its labels when the map redraws; a new year or viewpoint changes them without moving
    // the camera, so ask for that redraw or the old names stay up until the next drag.
    if (this.model.declutter(st, journeyCities, homeCity, now) && st.globe) this.map.triggerRepaint();
    const pulsing = this.model.cityViews.some(v => now - v.appearedAt < 1400) || this.model.arrivalPulsing(now);
    this.ui.timeline.setPace(!geo && st.playing && this.journeyUnderWay(st.year), st);
    if (fogChanged || visChanged || this.needsLayers || pulsing || geo) {
      this.needsLayers = false;
      const others = this.travellers(st, geo);
      if (geo) this.ui.journeyCard.setMeanwhile(others);
      this.overlay.setProps({layers: this.model.layers({state: st, fogUniforms: this.uniforms(st), geo, vpColor: this.data.vp[geo?.journey.viewpoint ?? st.vps[0]].color, now, others, routes: this.routeViews(st, geo)})});
    }
    if (geo || st.year >= 1957) this.ui.inset.update(st, geo, now);
    if (geo && st.follow) this.followCamera(st, geo, false);
    const card = !!(st.city || st.region || st.invention || st.book || st.living);
    if (st.autoCamera && !geo && !st.scrubbing && !card) {
      this.widen.update(st.vps, st.year, homeAt(this.data.vp[st.vps[0]], st.year).lon, this.widenPadding(), st.globe, now);
    }
    requestAnimationFrame(t => this.frame(t));
  }

  private advance(dt: number, s: State, geo: JourneyGeo | null) {
    if (!geo) {
      const sc = scaleFor(s);
      let x = sc.toX(s.year) + (dt * s.speed) / PLAY_SECONDS;
      let year = sc.fromX(x);
      if (s.allJourneys) {
        // Slow to the journey pace while anyone is travelling, and never skip a journey's start.
        if (this.journeyUnderWay(s.year)) year = Math.min(year, s.year + dt * s.journeySpeed * YEARS_PER_SECOND);
        for (const j of this.data.journeys) {
          const t0 = j.t[0];
          if (t0 > s.year && t0 <= year) year = t0;
        }
        x = sc.toX(year);
        for (const j of this.data.journeys) {
          const t0 = j.t[0];
          if (t0 > s.year - 1e-9 && t0 <= year && t0 !== this.announced) {
            this.announced = t0;
            this.ui.timeline.showCaption(t('{name} sets out', {name: tx.journey(j.id, 'name', j.name)}), this.data.vp[j.viewpoint].color);
          }
        }
      }
      this.announceMoments(s, s.year, year);
      if (x >= 1) this.store.set({year: sc.max, playing: false});
      else this.store.set({year});
      return;
    }
    const max = stepCount(geo) - 1;
    const target = this.travelTarget ?? max;
    // Also run at the first and final stop, before the end-of-journey check.
    if (this.ui.journeyCard.advance(dt, s)) return;
    if (s.progress >= target - 1e-6) {
      this.travelTarget = null;
      if (s.playing && s.progress >= max - 1e-6) this.store.set({playing: false, progress: max});
      return;
    }
    if (this.dwell > 0) {
      this.dwell -= dt * s.speed;
      return;
    }
    const k = Math.floor(s.progress + 1e-6);
    const dur = k >= geo.stops.length - 1 ? 2.4 : legDuration(geo.legs[k]);
    let next = s.progress + (dt * s.speed) / dur;
    if (Math.floor(next + 1e-6) > k) {
      next = Math.min(k + 1, target);
      this.dwell = s.playing ? 1.0 : 0;
    }
    this.store.set({progress: Math.min(next, target)});
  }

  private announced = NaN;
  private routeCache: {key: string; views: RouteView[]} = {key: '', views: []};
  private relativeCache: {key: string; views: RouteView[]} = {key: '', views: []};

  /** The journey list's matches, drawn whole while the list is open and nothing is being followed. */
  private routeViews(s: State, geo: JourneyGeo | null): RouteView[] {
    if (geo) return this.relativeViews(s, geo);
    if (!s.routes || s.panel !== 'journeys') return [];
    const key = `${s.routes.join(',')}|${getLang()}`;
    if (key !== this.routeCache.key) this.routeCache = {key, views: s.routes.flatMap(id => this.routeView(id))};
    return this.routeCache.views;
  }

  /**
   * While following a journey, its relatives stay faintly on the map: each party it sent out, once that party
   * has set out (Gan Ying from Ban Chao's Kucha), and, while following a party, the journey it belongs to.
   */
  private relativeViews(s: State, geo: JourneyGeo): RouteView[] {
    const j = geo.journey;
    const kids = (this.data.journeyChildren.get(j.id) ?? []).filter(c => s.year >= c.t[0]).map(c => c.id);
    const ids = j.parent ? [j.parent, ...kids] : kids;
    const key = `${j.id}>${ids.join(',')}|${getLang()}`;
    if (key !== this.relativeCache.key) this.relativeCache = {key, views: ids.flatMap(id => this.routeView(id, true))};
    return this.relativeCache.views;
  }

  private routeView(id: string, faint = false): RouteView[] {
    const g = this.geo(id);
    if (!g) return [];
    const j = g.journey;
    const paths = g.legs.filter(l => l.onMap).map(l => l.points);
    return paths.length ? [{id, name: tx.journey(id, 'name', j.name), years: tx.journey(id, 'years', j.years), color: hexToRgb(this.data.vp[j.viewpoint].color), paths, faint}] : [];
  }

  private journeyUnderWay(year: number) {
    return this.data.journeys.some(j => year >= j.t[0] && year <= j.t[j.t.length - 1] + FADE_YEARS);
  }

  /**
   * Everyone else on the map. During timeline playback (with "every journey" on): each journey under way,
   * fading after it ends. While following a journey: its contemporaries, named when they are near.
   */
  private travellers(s: State, geo: JourneyGeo | null): (Traveller & {km: number; where: string})[] {
    if (!geo && !s.allJourneys) return [];
    const me = geo ? travelled(geo, s.progress).pos : null;
    const ref = me ? me[0] : this.map.getCenter().lng;
    const out: (Traveller & {km: number; where: string})[] = [];
    for (const j of this.data.journeys) {
      if (geo && j.id === geo.journey.id) continue;
      const g = this.geo(j.id)!;
      const [t0, t1] = span(g);
      if (s.year < t0 || s.year > t1 + (geo ? 0 : FADE_YEARS)) continue;
      const at = atYear(g, Math.min(s.year, t1));
      if (!at.pos) continue;
      // Draw on the world copy nearest the followed traveller (or the view).
      const shift = Math.round((ref - at.pos[0]) / 360) * 360;
      const pos: [number, number] = [at.pos[0] + shift, at.pos[1]];
      const d = me ? km(me, pos) : 0;
      out.push({
        id: j.id,
        name: tx.journey(j.id, 'name', j.name),
        pos,
        trail: shift ? at.trail.map(t => t.map(([x, y]) => [x + shift, y] as [number, number])) : at.trail,
        color: hexToRgb(this.data.vp[j.viewpoint].color),
        alpha: s.year > t1 ? Math.max(0, 1 - (s.year - t1) / FADE_YEARS) : 1,
        labelled: !geo || d < NEAR_KM,
        ghost: !!geo,
        km: d,
        where: placeAt(g, at.progress),
      });
    }
    return out.sort((a, b) => a.km - b.km);
  }

  private announceMoments(s: State, from: number, to: number) {
    for (const m of momentsFor(this.data, s)) {
      if (m.year > from && m.year <= to) this.ui.timeline.showCaption(tx.moment(m.label), this.data.vp[m.vp].color);
    }
    // The plant or animal being followed: each viewpoint it reaches, as the years pass.
    const lv = s.living ? this.data.livingById.get(s.living) : undefined;
    for (const [i, a] of (lv?.spread ?? []).entries()) {
      if (lv && a.vp && a.mid > from && a.mid <= to)
        this.ui.timeline.showCaption(t('{thing} reaches {place}', {thing: tx.living(lv.id, 'name', lv.name), place: tx.arrival(lv.id, i, 'place', a.place)}), this.data.vp[a.vp].color);
    }
    for (const x of this.data.inventions) {
      const said = x.book ? 'Published: ' : 'Invented: ';
      if (x.mid > from && x.mid <= to) this.ui.timeline.showCaption(isZh() ? `${t(said)}${tx.invention(x.id, 'name', x.name)}` : `${said}${x.name.charAt(0).toLowerCase()}${x.name.slice(1)}`, '#8a6628');
    }
  }

  private uniforms(s: State): FogLayerUniforms {
    const a = this.data.vp[s.vps[0]].color;
    const b = this.data.vp[s.vps[1] ?? s.vps[0]].color;
    return {
      mode: s.compare && s.vps.length === 2 ? 1 : 0,
      noiseScale: 9,
      paper: rgb01(PAPER_FOG),
      edge: rgb01(EDGE),
      colorA: rgb01(a),
      colorB: rgb01(b),
      colorBoth: rgb01(mixHex(a, b, 0.5, 0.08)),
      highlight: rgb01(HIGHLIGHT),
    };
  }

  // ── Journeys ─────────────────────────────────────────────────────────────

  /** Follow a journey from its start, from the moment `year` (switching from another traveller), or from `stop`. */
  startJourney(id: string, year?: number, stop?: number) {
    const g = this.geo(id);
    if (!g) return;
    this.travelTarget = null;
    // Opened from the list, or hopping from one journey to another that was: the way back stays the list.
    if (!this.store.state.journey) this.backToList = isListPanel(this.store.state.panel) ? this.store.state.panel : null;
    this.store.set({
      journey: id,
      progress: stop ?? (year === undefined ? 0 : progressForYear(g, year, false)),
      playing: false,
      vps: [g.journey.viewpoint],
      compare: false,
      panel: 'none',
      details: false,
      city: null,
      region: null,
      regionCell: null,
      invention: null,
      book: null,
      living: null,
      globe: g.journey.globe ? true : this.store.state.globe,
    });
    if (this.store.state.follow) this.followCamera(this.store.state, g, true);
    else this.fitJourney(g);
  }

  /** Open a journey from a card at the stop where it comes to that place, or from its start if it never does. */
  private openJourneyAt(id: string, at?: JourneyAt) {
    const g = this.geo(id);
    if (g) this.startJourney(id, undefined, at ? this.stopAt(g, at) : undefined);
  }

  /**
   * Where a journey comes to a place: its stop at a city (or the first within 30 km of it), its first stop
   * inside a region, or its first stop near a point. Failing those, the stop that comes closest; a journey that
   * only made a region known, without going there, comes closest to the region's middle.
   */
  private stopAt(g: JourneyGeo, at: JourneyAt): number | undefined {
    const on = g.stops.map((st, i) => ({i, lat: st.stop.lat, lon: st.stop.lon})).filter((x): x is {i: number; lat: number; lon: number} => x.lat !== undefined && x.lon !== undefined);
    const dist = (lat: number, lon: number) => on.map(x => ({i: x.i, d: km([x.lon, x.lat], [lon, lat])}));
    const near = (lat: number, lon: number) => {
      const ds = dist(lat, lon);
      return (ds.find(x => x.d < 30) ?? ds.sort((a, b) => a.d - b.d)[0])?.i;
    };
    if (at.city) {
      const c = this.data.cityById.get(at.city);
      const i = g.stops.findIndex(st => st.stop.city === at.city);
      return i >= 0 ? i : c ? near(c.lat, c.lon) : undefined;
    }
    if (at.region) {
      const r = this.data.regionById.get(at.region);
      if (!r) return undefined;
      const inside = on.find(x => {
        const cell = cellAt(this.grid, x.lat, x.lon);
        const own = cell >= 0 ? this.data.regions[this.grid.region[cell]] : undefined;
        return !!own && (own.id === r.id || own.parents.includes(r.id) || own.within.includes(r.id));
      });
      if (inside) return inside.i;
      return r.label ? dist(r.label[1], r.label[0]).sort((a, b) => a.d - b.d)[0]?.i : undefined;
    }
    if (at.point) return near(at.point[1], at.point[0]);
    return undefined;
  }

  private sight(g: JourneyGeo): Sight {
    let s = this.sightCache.get(g.journey.id);
    if (!s) {
      s = new Sight(this.grid, g);
      this.sightCache.set(g.journey.id, s);
    }
    return s;
  }

  /** Room the panels take, so "centred" means centred in the open part of the map: the cards on the right, and
   * the left panel when a list is open. */
  private cameraPadding() {
    const s = this.store.state;
    const narrow = innerWidth < 760;
    return narrow
      ? {top: 120, bottom: Math.round(innerHeight * 0.56), left: 0, right: 0}
      : {top: 90, bottom: 110, left: isListPanel(s.panel) ? 400 : 20, right: (document.querySelector<HTMLElement>('.card-stack')?.offsetWidth ?? 392) + 28};
  }

  /** The widening frame runs with no card or journey open: only the top bar and the timeline cover the map. */
  private widenPadding() {
    const s = this.store.state;
    const narrow = innerWidth < 760;
    return narrow ? {top: 110, bottom: 150, left: 16, right: 16} : {top: 90, bottom: 130, left: isListPanel(s.panel) ? 400 : 40, right: 40};
  }

  /**
   * Reading holds the journey: a card opened while it plays (a city, a region) pauses it, so the traveller
   * and the camera stay put, and closing that card carries on. Pressing play with the card open just plays.
   */
  private holdForReading(s: State, p: State) {
    const card = (x: State) => !!(x.city || x.region || x.invention || x.book || x.living);
    if (!s.journey || s.journey !== p.journey || (s.playing && card(s))) this.heldForCard = false;
    if (!s.journey || s.journey !== p.journey) return;
    if (card(s) && !card(p) && s.playing) {
      this.heldForCard = true;
      queueMicrotask(() => this.store.set({playing: false}));
    } else if (!card(s) && card(p) && this.heldForCard) {
      this.heldForCard = false;
      if (!s.playing) queueMicrotask(() => this.store.set({playing: true}));
    }
  }

  /** A comfortable zoom for following: closer for short legs (Everest), wider for ocean crossings. */
  private followZoom(g: JourneyGeo) {
    const kms = g.legs.filter(l => l.onMap && l.km > 0).map(l => l.km).sort((a, b) => a - b);
    if (!kms.length) return 3;
    const median = kms[Math.floor(kms.length / 2)];
    const z = 6.4 - Math.log2(Math.max(1, median) / 160);
    return Math.max(this.store.state.globe ? 1.8 : 2.4, Math.min(6.8, z));
  }

  /** Keep the traveller centred: glide along legs frame by frame, fly across jumps. */
  private followCamera(s: State, g: JourneyGeo, entering: boolean) {
    if (this.followPaused || (performance.now() < this.flightUntil && !entering)) return;
    const {pos} = travelled(g, s.progress);
    if (!pos) return;
    const center: [number, number] = [pos[0], clampLat(pos[1], s.globe)];
    const padding = this.cameraPadding();
    if (entering) {
      this.flightUntil = performance.now() + 1700;
      this.map.flyTo({center, zoom: this.followZoom(g), padding, duration: 1600, essential: true});
      return;
    }
    const c = this.map.getCenter();
    const dLng = ((center[0] - c.lng + 540) % 360) - 180;
    if (Math.abs(dLng) < 1e-5 && Math.abs(center[1] - c.lat) < 1e-5) return;
    const a = this.map.project(c);
    const b = this.map.project([c.lng + dLng, center[1]]);
    if (Math.hypot(a.x - b.x, a.y - b.y) > 260) {
      this.flightUntil = performance.now() + 950;
      this.map.easeTo({center: [c.lng + dLng, center[1]], padding, duration: 900});
    } else {
      this.map.jumpTo({center: [c.lng + dLng, center[1]], padding});
    }
  }

  closeJourney() {
    this.travelTarget = null;
    this.store.set({journey: null, playing: false, progress: 0, details: false, ...(this.backToList ? {panel: this.backToList} : {})});
    this.backToList = null;
  }

  private fitJourney(g: JourneyGeo) {
    this.map.setPadding({top: 0, bottom: 0, left: 0, right: 0});
    if (g.journey.focus) {
      const [lng, lat] = g.journey.focus;
      this.map.flyTo({center: [lng, lat], zoom: innerWidth < 760 ? 1.4 : 2.1, duration: 1800, essential: true});
      return;
    }
    if (!g.bounds) return;
    const narrow = innerWidth < 760;
    const pad = narrow
      ? {top: 90, bottom: Math.round(innerHeight * 0.45), left: 30, right: 30}
      : {top: 110, bottom: 170, left: isListPanel(this.store.state.panel) ? 420 : 60, right: (document.querySelector<HTMLElement>('.card-stack')?.offsetWidth ?? 392) + 50};
    const [[w, sb], [e, n]] = g.bounds;
    const lat = (v: number) => clampLat(v, this.store.state.globe);
    if (e - w < 0.5 && n - sb < 0.5) {
      this.map.flyTo({center: [(w + e) / 2, lat((n + sb) / 2)], zoom: 6, duration: 1600});
      return;
    }
    const cam = this.map.cameraForBounds(
      [
        [w, lat(sb)],
        [e, lat(n)],
      ],
      {padding: pad, maxZoom: 5.5},
    );
    if (cam) this.map.flyTo({...cam, duration: 1700, essential: true});
  }

  step(dir: -1 | 1) {
    const s = this.store.state;
    const g = this.geo(s.journey);
    if (g) {
      const max = stepCount(g) - 1;
      const k = dir > 0 ? Math.floor(s.progress + 1e-6) + 1 : Math.ceil(s.progress - 1e-6) - 1;
      const target = Math.max(0, Math.min(max, k));
      this.store.set({playing: false});
      if (dir > 0 && target === Math.floor(s.progress + 1e-6) + 1) {
        this.travelTarget = target;
        this.dwell = 0;
      } else {
        this.travelTarget = null;
        this.store.set({progress: target});
      }
      return;
    }
    const ms = momentsFor(this.data, s);
    const m = dir > 0 ? ms.find(x => x.year > s.year + 0.5) : [...ms].reverse().find(x => x.year < s.year - 0.5);
    if (m) {
      this.store.set({year: m.year, playing: false});
      this.ui.timeline.showCaption(tx.moment(m.label), this.data.vp[m.vp].color);
    }
  }

  // ── Places ───────────────────────────────────────────────────────────────

  private labelCell(regionId: string): number | null {
    const r = this.data.regionById.get(regionId);
    if (!r?.label) return null;
    const i = this.data.regionIndex.get(regionId)!;
    const c = cellAt(this.grid, r.label[1], r.label[0]);
    if (c >= 0 && this.grid.region[c] === i) return c;
    for (let k = 0; k < this.grid.count; k++) if (this.grid.region[k] === i) return k;
    return c >= 0 ? c : null;
  }

  openRegion(id: string, fly: boolean) {
    const r = this.data.regionById.get(id);
    if (!r) return;
    this.store.set({region: id, regionCell: this.labelCell(id), city: null});
    if (fly && r.label) this.map.flyTo({center: [r.label[0], clampLat(r.label[1], this.store.state.globe)], zoom: Math.max(this.map.getZoom(), r.cells > 600 ? 2.2 : r.cells > 120 ? 3 : 4), duration: 1400});
  }

  openCity(id: string, fly: boolean) {
    const c = this.data.cityById.get(id);
    if (!c) return;
    this.store.set({city: id, region: null, regionCell: null, invention: null, book: null, living: null});
    if (fly) this.map.flyTo({center: [c.lon, c.lat], zoom: Math.max(this.map.getZoom(), 4.2), duration: 1400});
  }

  /** Open an invention at its year and centre its birthplace, even when already visible. */
  openInvention(id: string) {
    const x = this.data.inventionById.get(id);
    if (!x) return;
    const s = this.store.state;
    if (s.journey) this.closeJourney();
    const narrow = innerWidth < 760;
    this.store.set({invention: id, year: x.mid, playing: false, ...(narrow ? {panel: 'none' as const} : {})});
    this.map.flyTo({
      center: [x.lon, clampLat(x.lat, this.store.state.globe)],
      zoom: Math.max(this.map.getZoom(), 3),
      padding: narrow ? this.cameraPadding() : {top: 0, bottom: 0, left: 0, right: 0},
      duration: 1200,
      essential: true,
    });
  }

  /** Open a book from the shelf: a bound book that is also an invention as that invention; a work of its time
   * at the year it was written; a modern study at the year already shown. */
  async openBook(id: string) {
    const books = await loadBooks(this.data);
    const b = books?.byId.get(id);
    if (!b) return;
    if (b.invention) return this.openInvention(b.invention);
    if (this.store.state.journey) this.closeJourney();
    const narrow = innerWidth < 760;
    this.store.set({book: id, playing: false, ...(b.kind === 'work' && b.year !== undefined ? {year: clampYear(b.year)} : {}), ...(narrow ? {panel: 'none' as const} : {})});
  }

  /** The book before or after the open one on the shelf (a bound book open as its invention counts as itself). */
  private async stepBook(dir: -1 | 1) {
    const books = await loadBooks(this.data);
    if (!books) return;
    const s = this.store.state;
    const id = s.book ?? (s.invention ? this.data.inventionById.get(s.invention)?.book : undefined);
    const shelf = bookShelf(books);
    const i = shelf.findIndex(b => b.id === id);
    const next = i < 0 ? undefined : shelf[i + dir];
    if (next) void this.openBook(next.id);
  }

  /** What a book made known: a region as one viewpoint knew it, in the year the book took it furthest. */
  showRegionAs(vp: VpId | '*', region: string, year: number) {
    if (this.store.state.journey) this.closeJourney();
    this.store.set({...(vp === '*' ? {} : {vps: [vp], compare: false}), year: clampYear(year), playing: false});
    this.openRegion(region, true);
  }

  /** When a viewpoint came to know a plant or animal, on the timeline's scale. */
  private livingYear(x: Living, vp: VpId): number {
    return Math.max(START, Math.min(PRESENT, Math.round(x.known[vp] ?? x.origin.mid)));
  }

  /** Open a plant or animal at the year the viewpoint came to know it (or at `year`), framing where it spread. */
  openLiving(id: string, year?: number) {
    const x = this.data.livingById.get(id);
    if (!x) return;
    if (this.store.state.journey) this.closeJourney();
    const narrow = innerWidth < 760;
    this.store.set({living: id, year: year ?? this.livingYear(x, this.store.state.vps[0]), playing: false, ...(narrow ? {panel: 'none' as const} : {})});
    this.frameLiving(x, true);
  }

  /** Go to a place on the followed plant or animal's way: its year, the map over it, its name and a pulse. */
  pickArrival(i: number) {
    const x = this.store.state.living ? this.data.livingById.get(this.store.state.living) : undefined;
    const a = x?.spread[i];
    if (!a) return;
    this.store.set({arrival: i, year: Math.max(START, Math.round(a.mid)), playing: false});
    this.model.pulseArrival(performance.now());
    this.needsLayers = true;
    this.map.flyTo({center: [a.lon, clampLat(a.lat, this.store.state.globe)], zoom: Math.max(this.map.getZoom(), 3.5), duration: 1200, essential: true});
  }

  /** Bring a plant or animal's origin to the middle of the open map: between the list and the card on a wide
   * screen, above the card on a narrow one, close enough to see the land around it. */
  private frameLiving(x: Living, animate: boolean) {
    const s = this.store.state;
    const narrow = innerWidth < 760;
    const zoom = s.globe ? Math.max(this.map.getZoom(), 1.8) : Math.max(2.2, Math.min(this.map.getZoom(), 3));
    // The left list and the right card are both 400px wide: offset by half of whatever one is open alone.
    const left = !narrow && (s.panel === 'journeys' || s.panel === 'discoveries') ? 400 : 0;
    const right = narrow ? 0 : 400;
    const at = {
      center: [x.origin.lon, clampLat(x.origin.lat, s.globe)] as [number, number],
      zoom,
      offset: [(left - right) / 2, 0] as [number, number],
      padding: narrow ? this.cameraPadding() : {top: 0, bottom: 0, left: 0, right: 0},
    };
    // An instant fly rather than a jump, since only a fly takes an offset.
    this.map.flyTo({...at, duration: animate ? 1200 : 0, essential: true});
  }

  private choose(e: SearchEntry) {
    if (e.t === 'living') this.openLiving(e.id);
    else if (e.t === 'invention') this.openInvention(e.id);
    else if (e.t === 'journey') this.startJourney(e.id);
    else if (e.t === 'city') this.openCity(e.id, true);
    else this.openRegion(e.id, true);
  }

  private applyStartLinks() {
    const s = this.store.state;
    const g = this.geo(s.journey);
    if (g) {
      if (s.follow) this.followCamera(s, g, true);
      else this.fitJourney(g);
    }
    if (s.living) this.frameLiving(this.data.livingById.get(s.living)!, false);
    else if (s.invention) {
      const x = this.data.inventionById.get(s.invention)!;
      this.map.jumpTo({
        center: [x.lon, clampLat(x.lat, s.globe)],
        zoom: Math.max(this.map.getZoom(), 3),
        padding: innerWidth < 760 ? this.cameraPadding() : {top: 0, bottom: 0, left: 0, right: 0},
      });
    } else if (s.city) {
      const c = this.data.cityById.get(s.city)!;
      this.map.jumpTo({center: [c.lon, c.lat], zoom: 4});
    } else if (s.region) {
      const r = this.data.regionById.get(s.region)!;
      if (r.label) this.map.jumpTo({center: [r.label[0], clampLat(r.label[1], s.globe)], zoom: r.cells > 600 ? 2.2 : 3.2});
    }
  }

  private ensureHomeVisible(s: State) {
    const home = homeAt(this.data.vp[s.vps[0]], s.year);
    const b = this.map.getBounds();
    const inView = b.contains([home.lon, home.lat]) || b.contains([home.lon + 360, home.lat]) || b.contains([home.lon - 360, home.lat]);
    if (!inView) this.map.flyTo({center: [home.lon, Math.max(-50, Math.min(55, home.lat - 6))], duration: 1500, essential: true});
  }

  private setProjection(globe: boolean) {
    // The style only has to be parsed, not fully loaded; before that MapLibre throws, so retry once it is.
    try {
      this.map.setProjection({type: globe ? 'globe' : 'mercator'});
    } catch {
      this.map.once('style.load', () => this.setProjection(this.store.state.globe));
      return;
    }
    if (globe && this.map.getZoom() < 1.4) this.map.easeTo({zoom: 1.6, duration: 600});
    this.needsLayers = true;
  }

  private updateSeals(s: State) {
    for (const m of this.seals) m.remove();
    this.seals = s.vps.map(id => {
      const vp = this.data.vp[id];
      const home = homeAt(vp, s.year);
      const el = h(
        'div.seal',
        {title: `${vp.special ? t('Where people began') : t('Home of {vp}', {vp: tx.viewpoint(vp.id, 'longName', vp.longName)})}: ${tx.name(home.place)}`},
        h('div.seal-inner', {html: sealSvg(vp.seal, vp.color, 26)}),
      );
      return new Marker({element: el, anchor: 'bottom-right', offset: [-2, -2]}).setLngLat([home.lon, home.lat]).addTo(this.map);
    });
  }

  // ── Input ────────────────────────────────────────────────────────────────

  private bindMap() {
    const map = this.map;
    map.on('click', (e: MapLayerMouseEvent) => {
      const pick = this.overlay.pickObject({x: e.point.x, y: e.point.y, radius: 6, layerIds: PICKABLE});
      if (pick?.layer?.id === 'others') {
        this.startJourney((pick.object as Traveller).id, this.store.state.year);
        return;
      }
      if (pick?.layer?.id === 'routes') {
        // From a party back to the journey it belongs to: pick that journey up at the same moment.
        const r = (pick.object as {r: RouteView}).r;
        const cur = this.store.state.journey;
        const isParent = !!cur && this.data.journeyById.get(cur)?.parent === r.id;
        this.startJourney(r.id, isParent ? this.store.state.year : undefined);
        return;
      }
      if (pick?.layer?.id === 'living-points') {
        // A place on the way: go there, in the year it arrived; the origin just centres the map on it.
        const p = pick.object as LivingPoint;
        if (p.index >= 0) this.pickArrival(p.index);
        else this.map.flyTo({center: p.pos, zoom: Math.max(this.map.getZoom(), 3), duration: 1200, essential: true});
        return;
      }
      if (pick?.layer?.id.startsWith('inventions')) {
        this.openInvention((pick.object as InventionView).inv.id);
        return;
      }
      if (pick?.layer?.id.startsWith('cities')) {
        this.openCity((pick.object as CityView).city.id, false);
        return;
      }
      if (pick?.layer?.id === 'journey-stops') {
        this.travelTarget = null;
        this.store.set({progress: (pick.object as {i: number}).i, playing: false});
        return;
      }
      const cell = cellAt(this.grid, e.lngLat.lat, e.lngLat.lng);
      const ri = cell >= 0 ? this.grid.region[cell] : 0xffff;
      if (ri === 0xffff) {
        this.store.set({region: null, regionCell: null, city: null, invention: null, book: null, living: null});
        return;
      }
      this.store.set({region: this.data.regions[ri].id, regionCell: cell, city: null});
    });
    map.on('mousemove', (e: MapLayerMouseEvent) => {
      if (!this.pendingHover) requestAnimationFrame(() => this.hover());
      this.pendingHover = e;
    });
    map.getCanvas().addEventListener('mouseleave', () => {
      this.pendingHover = null;
      this.tip.classList.remove('show');
    });
    map.on('movestart', () => this.tip.classList.remove('show'));
    // Touching the map hands the camera back to the reader; the timeline's camera button turns it on again.
    // Listened for on the map itself, since a move already under way (our own easing) starts no new one.
    const handBack = () => {
      if (this.store.state.autoCamera) this.store.set({autoCamera: false});
    };
    for (const type of ['pointerdown', 'wheel'] as const) map.getCanvasContainer().addEventListener(type, handBack, {passive: true});
    map.on('movestart', e => {
      if (e.originalEvent) handBack();
    });
    map.on('dragstart', () => {
      if (this.store.state.journey && this.store.state.follow) this.followPaused = true;
    });
    map.on('moveend', () => (this.needsLayers = true));
    map.on('move', () => (this.needsLayers = true));
    // Globe labels are painted with the map's own frame so they never lag behind the dots.
    let labelsShown = false;
    map.on('render', () => {
      const st = this.store.state;
      if (!st.globe && !labelsShown) return;
      this.model.drawLabels(this.labelCanvas, st);
      labelsShown = st.globe;
    });
  }

  private pendingHover: MapLayerMouseEvent | null = null;

  private hover() {
    const e = this.pendingHover;
    this.pendingHover = null;
    if (!e || window.matchMedia('(pointer: coarse)').matches) return;
    const s = this.store.state;
    const pick = this.overlay.pickObject({x: e.point.x, y: e.point.y, radius: 6, layerIds: PICKABLE});
    const canvas = this.map.getCanvas();
    let text: HTMLElement | null = null;
    if (pick?.layer?.id === 'others') {
      const o = pick.object as Traveller & {where: string};
      text = h('div', h('strong', o.name), h('span.tip-sub', ` · ${o.where}`), h('div.tip-level', t(s.journey ? 'Click to follow instead' : 'Click to follow')));
      canvas.style.cursor = 'pointer';
    } else if (pick?.layer?.id === 'routes') {
      const r = (pick.object as {r: RouteView}).r;
      text = h('div', h('strong', r.name), h('span.tip-sub', ` · ${r.years}`), h('div.tip-level', t('Click to follow')));
      canvas.style.cursor = 'pointer';
    } else if (pick?.layer?.id === 'living-points') {
      const p = pick.object as LivingPoint;
      text = h('div', h('strong', p.label), h('span.tip-sub', ` · ${formatRange(p.year)}`), p.note ? h('div.tip-level', p.note) : null);
      canvas.style.cursor = 'pointer';
    } else if (pick?.layer?.id.startsWith('inventions')) {
      const x = (pick.object as InventionView).inv;
      text = h('div', h('strong', tx.invention(x.id, 'name', x.name)), h('span.tip-sub', ` · ${formatRange(x.year)}, ${tx.invention(x.id, 'place', x.place)}`));
      canvas.style.cursor = 'pointer';
    } else if (pick?.layer?.id.startsWith('cities')) {
      const v = pick.object as CityView;
      const status = cityStatus(v.city, s.year);
      text = h(
        'div',
        h('strong', v.label),
        status === 'living' ? null : h('span.tip-sub', ` · ${t(status === 'rediscovered' ? 'rediscovered ruin' : status)}`),
        v.wonders?.length ? h('span.tip-sub', ` · ${t('with {wonders}', {wonders: v.wonders.join(isZh() ? '、' : ', ')})}`) : null,
      );
      canvas.style.cursor = 'pointer';
    } else if (pick?.layer?.id === 'journey-stops') {
      const g = this.geo(s.journey)!;
      const st = g.stops[(pick.object as {i: number}).i];
      const k = g.stops.indexOf(st);
      text = h('div', h('strong', tx.stop(g.journey.id, k, 'place', st.stop.place ?? '')), h('span.tip-sub', ` · ${st.stop.date ? tx.stop(g.journey.id, k, 'date', st.stop.date) : formatYear(st.year)}`));
      canvas.style.cursor = 'pointer';
    } else {
      canvas.style.cursor = '';
      const cell = cellAt(this.grid, e.lngLat.lat, e.lngLat.lng);
      const ri = cell >= 0 ? this.grid.region[cell] : 0xffff;
      if (ri !== 0xffff) {
        const r = this.data.regions[ri];
        const vp: VpId = s.vps[0];
        const st = this.field.cellState(vp, cell, s.year);
        const called = r.names.find(n => n.vp === vp && (n.from === undefined || s.year >= n.from) && (n.to === undefined || s.year <= n.to));
        text = h(
          'div',
          h('strong', called ? tx.name(called.name) : tx.region(r.id, r.name)),
          called ? h('span.tip-sub', ` · ${tx.region(r.id, r.name)}`) : null,
          h('div.tip-level', levelName(vp, st.level)),
        );
      }
    }
    if (!text) {
      this.tip.classList.remove('show');
      return;
    }
    this.tip.replaceChildren(text);
    // Below and right of the pointer, or on its other side where that would run off the screen.
    const {offsetWidth: w, offsetHeight: ht} = this.tip;
    const x = e.point.x + 14 + w > innerWidth - 8 ? e.point.x - 14 - w : e.point.x + 14;
    const y = e.point.y + 14 + ht > innerHeight - 8 ? e.point.y - 14 - ht : e.point.y + 14;
    this.tip.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
    this.tip.classList.add('show');
  }

  private bindKeys() {
    const editing = (e: KeyboardEvent) => {
      const target = e.target;
      return target instanceof HTMLElement && (target.isContentEditable || !!target.closest('input, textarea, select'));
    };
    const blocked = (e: KeyboardEvent) => e.defaultPrevented || e.isComposing || e.altKey || e.ctrlKey || e.metaKey || editing(e);
    const overlayOpen = () => this.store.state.search || this.store.state.panel === 'about' || !!document.querySelector('.lightbox');

    // Capture card navigation before MapLibre can use arrows to pan a focused map.
    document.addEventListener('keydown', e => {
      if (blocked(e) || e.shiftKey || overlayOpen() || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      const s = this.store.state;
      const id = s.invention;
      const landmarks = !id && !s.living && !s.book && s.city ? this.ui.journey.landmarkNeighbors(s.city) : null;
      if (!id && !s.book && !landmarks) return;
      e.preventDefault();
      e.stopPropagation();
      if (landmarks) {
        const next = e.key === 'ArrowLeft' ? landmarks.previous : landmarks.next;
        if (next) this.ui.journey.openLandmark(next.id);
        return;
      }
      // A book steps along the shelf, an invention along the inventions (the bound books are on the shelf).
      if (s.book || this.data.inventionById.get(id!)?.book) return void this.stepBook(e.key === 'ArrowLeft' ? -1 : 1);
      const list = this.data.inventions.filter(x => !x.book);
      const i = list.findIndex(x => x.id === id);
      const next = i < 0 ? undefined : list[i + (e.key === 'ArrowLeft' ? -1 : 1)];
      if (next) this.openInvention(next.id);
    }, true);

    document.addEventListener('keydown', e => {
      const t = e.target as HTMLElement;
      if (blocked(e)) return;
      const s = this.store.state;
      if (e.key === '/') {
        e.preventDefault();
        this.store.set({search: true});
      } else if (e.key === ' ' || e.code === 'Space') {
        if (t?.tagName === 'BUTTON') return;
        e.preventDefault();
        this.store.set({playing: !s.playing});
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (overlayOpen()) return;
        e.preventDefault();
        const dir = e.key === 'ArrowLeft' ? -1 : 1;
        if (e.shiftKey) this.store.set({year: s.year + dir, playing: false});
        else this.step(dir);
      } else if (e.key === 'Escape') {
        if (s.search) this.store.set({search: false});
        else if (s.panel !== 'none') this.store.set({panel: 'none'});
        else if (s.details) this.store.set({details: false});
        else if (s.city || s.region || s.invention || s.book || s.living) this.store.set({city: null, region: null, regionCell: null, invention: null, book: null, living: null});
        else if (s.journey) this.closeJourney();
      }
    });
  }
}

function initialZoom() {
  const w = innerWidth;
  return w < 600 ? 0.9 : w < 1100 ? 1.35 : w < 1700 ? 1.75 : 2.1;
}

async function main() {
  const loading = document.getElementById('loading')!;
  try {
    const lang = initialLang();
    const [data] = await Promise.all([loadData(), fontsReady()]);
    const zh = lang === 'zh' ? await loadZh(data) : null;
    if (zh) await zhFontsReady(zh.chars);
    setLang(zh ? 'zh' : 'en', zh);
    const grid = buildGrid(data.grid);
    const app = new App(data, grid);
    (window as unknown as {atlas: App}).atlas = app;
    const done = () => {
      loading.classList.add('done');
      setTimeout(() => loading.remove(), 900);
    };
    if (app.map.loaded()) done();
    else {
      app.map.once('load', done);
      setTimeout(done, 4000);
    }
  } catch (err) {
    console.error(err);
    loading.querySelector('.loading-sub')!.textContent = err instanceof Error ? err.message : String(err);
    loading.classList.add('error');
  }
}

main();
