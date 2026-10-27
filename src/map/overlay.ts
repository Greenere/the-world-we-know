import type {Layer} from '@deck.gl/core';
import {PathStyleExtension, type PathStyleExtensionProps} from '@deck.gl/extensions';
import {IconLayer, PathLayer, ScatterplotLayer, TextLayer} from '@deck.gl/layers';
import {LngLat as MlLngLat, type Map as MlMap} from 'maplibre-gl';
import type {AppData} from '../data';
import {communityOf, historicalName, landmarkKnown, nameFor, phaseAt} from '../data';
import type {FogField} from '../fog/field';
import {cellAt, type Grid} from '../fog/grid';
import {FogLayer, type FogLayerUniforms} from '../fog/layer';
import type {JourneyGeo, LngLat} from '../journey-geo';
import {cleanPath, currentStopIndex, travelled} from '../journey-geo';
import type {State} from '../state';
import type {City, Invention, VpId} from '../types';
import {tx} from '../i18n';
import {hexToRgb} from '../ui/color';
import {horizonCull, SURFACE_PARAMETERS} from './horizon';

export type CityStatus = 'unborn' | 'living' | 'ruin' | 'lost' | 'rediscovered';

const mid = (d: number | [number, number] | undefined) => (d === undefined ? undefined : typeof d === 'number' ? d : (d[0] + d[1]) / 2);

export function cityStatus(c: City, year: number): CityStatus {
  const f = mid(c.dates.founded) ?? -Infinity;
  const ab = mid(c.dates.abandoned);
  const fo = mid(c.dates.forgotten);
  const re = mid(c.dates.rediscovered);
  if (year < f) return 'unborn';
  if (ab === undefined || year < ab) return 'living';
  if (re !== undefined && year >= re) return 'rediscovered';
  if (fo !== undefined && year >= fo) return 'lost';
  return 'ruin';
}

// One instance for the app's lifetime: a new extension object makes deck.gl rebuild the layer's shaders.
const DASHED = new PathStyleExtension({dash: true});

const INK: [number, number, number] = [43, 34, 25];
const PAPER: [number, number, number] = [244, 237, 220];
const SEPIA: [number, number, number] = [104, 80, 52];
const BRASS: [number, number, number] = [138, 102, 40];
const RUBRIC: [number, number, number] = [155, 47, 32];
/** Natural landmarks: a muted moss green, apart from the ink of what people built. */
const MOSS: [number, number, number] = [72, 94, 58];
/** Canals: the blue-grey of deep water. */
const CANAL: [number, number, number] = [62, 98, 116];
// Chinese labels fall through to Noto Serif SC glyph by glyph.
const FONT_TEXT = '"IM Fell English", "EB Garamond", "Noto Serif SC", Georgia, serif';
const FONT_SC = '"IM Fell English SC", "IM Fell English", "Noto Serif SC", Georgia, serif';

// ── Icon atlas, drawn once at runtime ──────────────────────────────────────

interface Atlas {
  url: string;
  /** The sprite sheet itself, for drawing the same signs on the globe's label canvas. */
  sheet: HTMLCanvasElement;
  mapping: Record<string, {x: number; y: number; width: number; height: number; anchorY: number; mask: boolean}>;
}

function buildAtlas(): Atlas {
  const S = 64;
  const names = ['city1', 'city2', 'city3', 'ruin', 'rediscovered', 'lost', 'invention', 'built', 'natural', 'peak', 'volcano', 'falls', 'gorge', 'rock'];
  const canvas = document.createElement('canvas');
  canvas.width = S * names.length;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  const ink = 'rgb(43,34,25)';
  const paper = 'rgb(246,240,226)';
  const mapping: Atlas['mapping'] = {};
  names.forEach((name, i) => {
    const cx = i * S + S / 2;
    const cy = S / 2;
    ctx.save();
    ctx.lineJoin = 'round';
    if (name.startsWith('city')) {
      const tier = Number(name.slice(4));
      // A filled dot ringed in paper; capitals get a second ring, the old cartographer's convention.
      ctx.fillStyle = paper;
      ctx.beginPath();
      ctx.arc(cx, cy, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.arc(cx, cy, tier === 1 ? 14 : 17, 0, Math.PI * 2);
      ctx.fill();
      if (tier === 1) {
        ctx.strokeStyle = ink;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(cx, cy, 22, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (name === 'ruin' || name === 'rediscovered') {
      // A broken square: the map sign for ruins.
      ctx.fillStyle = paper;
      ctx.fillRect(cx - 22, cy - 22, 44, 44);
      ctx.strokeStyle = name === 'rediscovered' ? 'rgb(155,47,32)' : ink;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(cx - 8, cy - 17);
      ctx.lineTo(cx - 17, cy - 17);
      ctx.lineTo(cx - 17, cy + 17);
      ctx.lineTo(cx + 17, cy + 17);
      ctx.lineTo(cx + 17, cy + 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + 3, cy - 17);
      ctx.lineTo(cx + 17, cy - 17);
      ctx.lineTo(cx + 17, cy - 7);
      ctx.stroke();
      if (name === 'rediscovered') {
        ctx.fillStyle = 'rgb(155,47,32)';
        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (name === 'built') {
      // A small pyramid on a paper ground: something people raised.
      ctx.fillStyle = paper;
      ctx.beginPath();
      ctx.arc(cx, cy, 27, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = ink;
      ctx.fillStyle = 'rgb(214,196,160)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 18);
      ctx.lineTo(cx + 19, cy + 14);
      ctx.lineTo(cx - 19, cy + 14);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (['natural', 'peak', 'volcano', 'falls', 'gorge', 'rock'].includes(name)) {
      // Natural wonders in moss green, each in the old map sign for its kind, on a paper ground.
      ctx.fillStyle = paper;
      ctx.beginPath();
      ctx.arc(cx, cy, 27, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgb(72,94,58)';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      const line = (...pts: number[]) => {
        ctx.beginPath();
        ctx.moveTo(cx + pts[0], cy + pts[1]);
        for (let k = 2; k < pts.length; k += 2) ctx.lineTo(cx + pts[k], cy + pts[k + 1]);
        ctx.stroke();
      };
      if (name === 'peak') {
        // Two summits, the higher with a snowline.
        line(-20, 14, -5, -15, 3, -3, 8, -9, 20, 14);
        line(-10, -5, -5, -2, 0, -6);
      } else if (name === 'volcano') {
        // A truncated cone, smoke curling from the crater.
        line(-20, 15, -6, -7, 6, -7, 20, 15);
        ctx.beginPath();
        ctx.moveTo(cx, cy - 10);
        ctx.bezierCurveTo(cx - 6, cy - 14, cx + 6, cy - 18, cx, cy - 23);
        ctx.stroke();
      } else if (name === 'falls') {
        // A ledge, water falling from it, spray below.
        line(-19, -14, 19, -14);
        line(-8, -14, -8, 8);
        line(0, -14, 0, 11);
        line(8, -14, 8, 8);
        line(-15, 17, -7, 15, 0, 18, 7, 15, 15, 17);
      } else if (name === 'gorge') {
        // Stepped walls falling to a river.
        line(-21, -13, -12, -13, -10, -3, -5, -3, -2, 14);
        line(21, -13, 12, -13, 10, -3, 5, -3, 2, 14);
      } else if (name === 'rock') {
        // A lone domed rock on the plain.
        ctx.beginPath();
        ctx.moveTo(cx - 19, cy + 10);
        ctx.bezierCurveTo(cx - 18, cy - 14, cx + 18, cy - 14, cx + 19, cy + 10);
        ctx.closePath();
        ctx.stroke();
        line(-23, 15, 23, 15);
      } else {
        line(-19, 6, -5, -16, 3, -5, 8, -11, 19, 6);
        ctx.beginPath();
        ctx.moveTo(cx - 16, cy + 16);
        ctx.quadraticCurveTo(cx - 8, cy + 10, cx, cy + 16);
        ctx.quadraticCurveTo(cx + 8, cy + 22, cx + 16, cy + 16);
        ctx.stroke();
      }
    } else if (name === 'invention') {
      // A brass compass rose in a ring: where an instrument or idea was first made.
      const brass = 'rgb(138,102,40)';
      ctx.fillStyle = paper;
      ctx.beginPath();
      ctx.arc(cx, cy, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = brass;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(cx, cy, 22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = brass;
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4 - Math.PI / 2;
        const r = k % 2 ? 6 : 17;
        ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.strokeStyle = ink;
      ctx.lineWidth = 4;
      ctx.setLineDash([6, 7]);
      ctx.beginPath();
      ctx.arc(cx, cy, 18, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    mapping[name] = {x: i * S, y: 0, width: S, height: S, anchorY: S / 2, mask: false};
  });
  return {url: canvas.toDataURL(), sheet: canvas, mapping};
}

// ── Overlay state ──────────────────────────────────────────────────────────

export interface CityView {
  city: City;
  status: CityStatus;
  /** Tier as drawn this year: cities long before their heyday draw a size smaller. */
  tier: 1 | 2 | 3;
  label: string;
  pos: LngLat;
  appearedAt: number;
}

export function tierAt(c: City, year: number): 1 | 2 | 3 {
  const peak = mid(c.dates.peak);
  return peak !== undefined && year < peak - 400 ? (Math.min(3, c.tier + 1) as 1 | 2 | 3) : c.tier;
}

interface RegionLabel {
  id: string;
  text: string;
  pos: LngLat;
  size: number;
  cells: number;
}

/** Another traveller on the map: every journey under way during playback, or contemporaries of the one followed. */
export interface Traveller {
  id: string;
  name: string;
  pos: LngLat;
  trail: LngLat[][];
  color: [number, number, number];
  /** 0–1: fades out after the journey ends. */
  alpha: number;
  labelled: boolean;
  /** Drawn quieter: a contemporary of the journey being followed. */
  ghost: boolean;
}

/** A whole journey route, drawn when the journey list shows its matches on the map. */
export interface RouteView {
  id: string;
  name: string;
  years: string;
  color: [number, number, number];
  paths: LngLat[][];
}

export interface OverlayContext {
  data: AppData;
  grid: Grid;
  field: FogField;
  map: MlMap;
}

export class OverlayModel {
  private atlas = buildAtlas();
  cityViews: CityView[] = [];
  private visibleKey = '';
  private appeared = new Map<string, number>();
  /** Names to print: cities and landmarks beside their marks, lakes and bays lettered on the water, regions. */
  private labels: {cities: CityView[]; waters: CityView[]; regions: RegionLabel[]} = {cities: [], waters: [], regions: []};
  private regionLabels: RegionLabel[] = [];
  private travellerLabels: Traveller[] = [];
  /** Whole turns of 360° added to journey geometry so it lands on the world copy the camera is looking at. */
  private journeyShift = 0;
  private declutterKey = '';
  private declutteredAt = 0;

  private charset: string;
  private baseCharset: string;

  constructor(private ctx: OverlayContext) {
    const chars = new Set<string>(' \u200A0123456789-–’\'.,()ʻ·');
    for (const c of ctx.data.cities) for (const n of c.names) for (const ch of n.name) chars.add(ch);
    for (const r of ctx.data.regions) for (const n of r.names) for (const ch of n.name) chars.add(ch);
    for (const x of ctx.data.inventions) for (const ch of x.name) chars.add(ch);
    for (const j of ctx.data.journeys) for (const ch of j.name) chars.add(ch);
    this.baseCharset = [...chars].join('');
    this.charset = this.baseCharset + tx.chars();
  }

  /**
   * Which cities show for these viewpoints in this year: they need Contact (level 2) at home,
   * or to have been seen by the traveller on the open journey.
   */
  /** After a language change: rebuild the label font atlas and the labels themselves. */
  relabel() {
    this.charset = this.baseCharset + tx.chars();
    this.visibleKey = '';
    this.labels = {cities: [], waters: [], regions: []};
  }

  updateVisibility(state: State, now: number, seen: Float32Array | null) {
    const year = Math.round(state.year);
    const key = `${state.vps.join(',')}|${year}|${state.journey}|${seen ? Math.round(state.progress * 4) : 0}`;
    if (key === this.visibleKey) return false;
    const first = this.visibleKey === '';
    const prevYear = Number(this.visibleKey.split('|')[1]);
    this.visibleKey = key;
    const {data, field} = this.ctx;
    const humanity = state.vps.includes('humanity');
    const levels = state.vps.map(vp => field.levelsFor(vp, year).level);
    const labelVp: VpId = state.vps[0];
    const sharedVp = communityOf(data, labelVp, year);
    const views: CityView[] = [];
    for (const c of data.cities) {
      const status = cityStatus(c, year);
      if (status === 'unborn') continue;
      if (status === 'lost' && !humanity) continue;
      if (!humanity && !levels.some(l => l[c.cell] >= 2) && !(seen && seen[c.cell] >= 0.6)) continue;
      // A landmark stays off a viewpoint's map until that viewpoint knew the place itself, not just the land.
      if (c.kind && !humanity && state.vps.every(vp => landmarkKnown(data, field, c, vp) > year)) continue;
      const name = nameFor(c.names, labelVp, year, c.id, sharedVp)!;
      const prev = this.appeared.get(c.id);
      let appearedAt = prev ?? (first ? -1e9 : now);
      if (prev === undefined) this.appeared.set(c.id, appearedAt);
      // A city founded in a year we just played through pulses even if it was already known about.
      const founded = mid(c.dates.founded) ?? -Infinity;
      if (!first && founded > prevYear && founded <= year && prev !== undefined) {
        appearedAt = now;
        this.appeared.set(c.id, now);
      }
      // A landmark rebuilt age after age (the Great Wall) marks the works of the age, and is a ruin in one that let it fall.
      const phase = phaseAt(c, year);
      const shown = phase?.idle ? 'ruin' : status;
      views.push({city: c, status: shown, tier: tierAt(c, year), label: tx.name(name.name), pos: phase ? phase.anchor : [c.lon, c.lat], appearedAt});
    }
    const shown = new Set(views.map(v => v.city.id));
    for (const id of [...this.appeared.keys()]) if (!shown.has(id)) this.appeared.delete(id);
    this.cityViews = views;

    // Region names only where this viewpoint had a name of its own for the place.
    const lvl = levels[0];
    const rl: RegionLabel[] = [];
    if (!humanity) {
      for (let i = 0; i < data.regions.length; i++) {
        const r = data.regions[i];
        if (!r.label || r.hidden) continue;
        const n = historicalName(r.names, labelVp, year, sharedVp);
        if (!n) continue;
        const cell = labelCell(this.ctx.grid, r.id, r.label);
        if (cell >= 0 && lvl[cell] < 1) continue;
        const size = r.cells > 900 ? 15 : r.cells > 250 ? 13.5 : r.cells > 60 ? 12 : 11;
        rl.push({id: r.id, text: spaced(tx.name(n.name)), pos: r.label, size, cells: r.cells});
      }
    }
    this.regionLabels = rl;
    this.declutterKey = '';
    return true;
  }

  /**
   * Greedy label placement in screen space: big cities first, then region names. While the camera
   * moves the labels ride along and are re-placed at most every 400 ms; labels already placed keep
   * their place, so following a traveller does not make names flicker.
   */
  declutter(state: State, journeyCities: Set<string>, homeCity: string | null, now: number) {
    const {map} = this.ctx;
    const zoom = map.getZoom();
    const key = `${this.visibleKey}|${zoom.toFixed(2)}|${map.getCenter().lng.toFixed(2)},${map.getCenter().lat.toFixed(2)}|${state.globe}|${[...journeyCities].join()}`;
    if (key === this.declutterKey) return;
    const dataChanged = !this.declutterKey.startsWith(`${this.visibleKey}|`);
    if (!dataChanged && map.isMoving() && now - this.declutteredAt < 400) return;
    this.declutterKey = key;
    this.declutteredAt = now;
    const placed = new Set<string>([...this.labels.cities.map(v => v.city.id), ...this.labels.regions.map(r => r.id)]);
    const transform = (map as unknown as {transform?: {isLocationOccluded?(l: MlLngLat): boolean}}).transform;
    const hidden = (lng: number, lat: number) => state.globe && !!transform?.isLocationOccluded?.(new MlLngLat(((lng + 540) % 360) - 180, lat));
    type Box = [number, number, number, number];
    const boxes: {b: Box; tier: number}[] = [];
    const W = map.getContainer().clientWidth;
    const H = map.getContainer().clientHeight;
    const hit = (b: Box, tier = 0) =>
      boxes.some(({b: o, tier: t}) => (tier === 0 || t <= tier) && b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
    const minTier = zoom >= 3.6 ? 3 : zoom >= 2.4 ? 2 : 1;
    // Water is lettered across the lake itself, ahead of any city label.
    const waters: CityView[] = [];
    for (const v of this.cityViews) {
      if (v.city.subtype !== 'water' || hidden(v.pos[0], v.pos[1])) continue;
      const p = map.project([v.pos[0], clampLat(v.pos[1], state.globe)]);
      const w = ems(v.label) * waterSize(v) * 0.9;
      if (p.x < -w || p.y < -20 || p.x > W + w || p.y > H + 20) continue;
      boxes.push({b: [p.x - w / 2, p.y - waterSize(v) * 0.7, p.x + w / 2, p.y + waterSize(v) * 0.7], tier: 0});
      waters.push(v);
    }
    const cand = this.cityViews
      .filter(v => v.city.subtype !== 'water')
      .filter(v => v.tier <= minTier || journeyCities.has(v.city.id) || v.city.id === homeCity || v.city.id === state.city)
      .sort((a, b) => prio(a) - prio(b));
    function prio(v: CityView) {
      if (v.city.id === state.city) return -3;
      if (journeyCities.has(v.city.id)) return -2;
      if (v.city.id === homeCity) return -1;
      return v.tier * 10 + (isLow(v) ? 5 : 0) - (placed.has(v.city.id) ? 4 : 0);
    }
    // Every visible dot is an obstacle, so no label is printed across another city.
    const screen = new Map<CityView, {x: number; y: number}>();
    for (const v of this.cityViews) {
      if (v.city.subtype === 'water' || hidden(v.pos[0], v.pos[1])) continue;
      const p = map.project([v.pos[0], clampLat(v.pos[1], state.globe)]);
      if (p.x < -40 || p.y < -20 || p.x > W + 40 || p.y > H + 20) continue;
      screen.set(v, p);
      boxes.push({b: [p.x - 4.5, p.y - 4.5, p.x + 4.5, p.y + 4.5], tier: v.tier});
    }
    const cities: CityView[] = [];
    for (const v of cand) {
      const p = screen.get(v);
      if (!p) continue;
      const size = citySize(v.tier);
      const w = ems(v.label) * size + 4;
      const b: Box = [p.x + 6, p.y - size * 0.6, p.x + 8 + w, p.y + size * 0.6];
      if (hit(b, v.tier)) continue;
      boxes.push({b, tier: 0});
      cities.push(v);
    }
    const regions: RegionLabel[] = [];
    const cellPx = (512 * 2 ** zoom) / 360 / 1.0;
    for (const r of this.regionLabels.sort((a, b) => (placed.has(b.id) ? 1e6 : 0) + b.cells - (placed.has(a.id) ? 1e6 : 0) - a.cells)) {
      if (hidden(r.pos[0], r.pos[1])) continue;
      const p = map.project([r.pos[0], clampLat(r.pos[1], state.globe)]);
      if (p.x < 0 || p.y < 0 || p.x > W || p.y > H) continue;
      const w = ems(r.text) * r.size * 0.875;
      const regionPx = Math.sqrt(r.cells) * cellPx * 1.1;
      if (regionPx < w * 0.55 && zoom < 5) continue;
      const b: Box = [p.x - w / 2, p.y - r.size * 0.7, p.x + w / 2, p.y + r.size * 0.7];
      if (hit(b, 3)) continue;
      boxes.push({b, tier: 0});
      regions.push(r);
    }
    this.labels = {cities, waters, regions};
  }

  /** Cut paths where they pass behind the globe, so no segment is drawn across the horizon. */
  private splitAtHorizon(paths: LngLat[][]): LngLat[][] {
    const transform = (this.ctx.map as unknown as {transform?: {isLocationOccluded?(l: MlLngLat): boolean}}).transform;
    if (!transform?.isLocationOccluded) return paths;
    const out: LngLat[][] = [];
    for (const path of paths) {
      let run: LngLat[] = [];
      for (const p of path) {
        if (transform.isLocationOccluded(new MlLngLat(((p[0] + 540) % 360) - 180, p[1]))) {
          if (run.length > 1) out.push(run);
          run = [];
        } else run.push(p);
      }
      if (run.length > 1) out.push(run);
    }
    return out;
  }

  /** Globe only: paint the placed labels onto a 2D canvas over the map. */
  drawLabels(canvas: HTMLCanvasElement, state: State) {
    const {map} = this.ctx;
    const dpr = devicePixelRatio || 1;
    const W = map.getContainer().clientWidth;
    const H = map.getContainer().clientHeight;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    }
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!state.globe) return;
    const transform = (map as unknown as {transform?: {isLocationOccluded?(l: MlLngLat): boolean}}).transform;
    const hidden = (lng: number, lat: number) => !!transform?.isLocationOccluded?.(new MlLngLat(((lng + 540) % 360) - 180, lat));
    ctx.lineJoin = 'round';
    const paper = `rgba(${PAPER.join(',')},0.85)`;
    // Landmark and ruin signs first, so every label prints over them.
    for (const v of this.cityViews) {
      const icon = isLow(v) && v.city.subtype !== 'water' ? markIcon(v) : null;
      if (!icon || hidden(v.pos[0], v.pos[1])) continue;
      const m = this.atlas.mapping[icon];
      const p = map.project(v.pos);
      const size = markSize(v);
      ctx.globalAlpha = markAlpha(v) / 255;
      ctx.drawImage(this.atlas.sheet, m.x, m.y, m.width, m.height, p.x - size / 2, p.y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
    for (const r of this.labels.regions) {
      if (hidden(r.pos[0], r.pos[1])) continue;
      const p = map.project(r.pos);
      ctx.font = `${r.size}px ${FONT_SC}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = paper;
      ctx.strokeText(r.text, p.x, p.y);
      ctx.fillStyle = `rgba(${SEPIA.join(',')},0.85)`;
      ctx.fillText(r.text, p.x, p.y);
    }
    for (const v of this.labels.waters) {
      if (hidden(v.pos[0], v.pos[1])) continue;
      const p = map.project(v.pos);
      ctx.font = `italic ${waterSize(v)}px ${FONT_TEXT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = paper;
      ctx.strokeText(v.label, p.x, p.y);
      ctx.fillStyle = `rgba(${MOSS.join(',')},0.9)`;
      ctx.fillText(v.label, p.x, p.y);
    }
    for (const v of this.labels.cities) {
      if (hidden(v.pos[0], v.pos[1])) continue;
      const p = map.project(v.pos);
      ctx.font = `${citySize(v.tier)}px ${FONT_TEXT}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const x = p.x + (v.city.kind ? 9 : v.status === 'living' ? 7 + (3 - v.tier) : 8);
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = paper;
      ctx.strokeText(v.label, x, p.y);
      ctx.fillStyle = `rgba(${(v.city.kind === 'natural' ? MOSS : INK).join(',')},${v.status === 'living' ? 0.96 : v.status === 'lost' ? 0.47 : 0.65})`;
      ctx.fillText(v.label, x, p.y);
    }
    for (const o of this.travellerLabels) {
      if (hidden(o.pos[0], o.pos[1])) continue;
      const p = map.project([o.pos[0] + this.journeyShift, o.pos[1]]);
      ctx.font = `italic 13px ${FONT_TEXT}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = paper;
      ctx.strokeText(o.name, p.x + 9, p.y);
      ctx.fillStyle = `rgba(${o.color.join(',')},${o.alpha * (o.ghost ? 0.62 : 1)})`;
      ctx.fillText(o.name, p.x + 9, p.y);
    }
  }

  layers(args: {
    state: State;
    fogUniforms: FogLayerUniforms;
    geo: JourneyGeo | null;
    vpColor: string;
    now: number;
    others: Traveller[];
    routes: RouteView[];
  }): Layer[] {
    const {state, fogUniforms, geo, vpColor, now, others, routes} = args;
    const {grid, field} = this.ctx;
    const globe = state.globe;
    const P = (p: LngLat): LngLat => [p[0], clampLat(p[1], globe)];
    // Journeys keep their longitudes unwrapped so a circumnavigation stays one unbroken line (Spithead
    // ends at 359°), but the camera wraps to ±180°. Draw them on the copy nearest the camera.
    const anchor = geo ? travelled(geo, state.progress).pos : null;
    this.journeyShift = anchor ? Math.round((this.ctx.map.getCenter().lng - anchor[0]) / 360) * 360 : 0;
    const shift = this.journeyShift;
    const PJ = shift ? (p: LngLat): LngLat => [p[0] + shift, clampLat(p[1], globe)] : P;
    const layers: Layer[] = [
      new FogLayer({
        id: 'fog',
        parameters: SURFACE_PARAMETERS,
        mesh: grid.mesh,
        values: field.values,
        edges: field.edges,
        version: field.version,
        uniforms: fogUniforms,
      }),
    ];

    // deck.gl 9.4 distorts icon and text quads on its globe view, so there cities are drawn as circles
    // and every label goes to a 2D canvas instead (see drawLabels).
    if (!globe) layers.push(
      new TextLayer<RegionLabel>({
        id: 'region-labels',
        parameters: SURFACE_PARAMETERS,
        extensions: [horizonCull],
        data: this.labels.regions,
        getText: d => d.text,
        getPosition: d => P(d.pos),
        getSize: d => d.size,
        getColor: [...SEPIA, 215],
        fontFamily: FONT_SC,
        characterSet: this.charset,
        fontSettings: {sdf: true, fontSize: 64, buffer: 10, radius: 14},
        outlineWidth: 3,
        outlineColor: [...PAPER, 170],
        sizeUnits: 'pixels',
      }),
    );

    const pulses = this.cityViews.filter(v => now - v.appearedAt < 1400);
    if (pulses.length) {
      layers.push(
        new ScatterplotLayer<CityView>({
          id: 'city-pulses',
          parameters: SURFACE_PARAMETERS,
          extensions: [horizonCull],
          data: pulses,
          getPosition: d => P(d.pos),
          getRadius: d => 4 + ((now - d.appearedAt) / 1400) * 22,
          getLineColor: d => [...INK, Math.round(200 * (1 - (now - d.appearedAt) / 1400))],
          stroked: true,
          filled: false,
          radiusUnits: 'pixels',
          lineWidthUnits: 'pixels',
          getLineWidth: 1.4,
          updateTriggers: {getRadius: now, getLineColor: now, getPosition: globe},
        }),
      );
    }

    layers.push(...this.landmarkPathLayers(state, P));
    if (globe) {
      layers.push(
        // Landmark and ruin signs are drawn on the label canvas beneath the labels (deck's globe cannot draw
        // icons); a near-invisible disc keeps each clickable.
        new ScatterplotLayer<CityView>({
          id: 'cities-globe-low',
          parameters: SURFACE_PARAMETERS,
          extensions: [horizonCull],
          data: this.cityViews.filter(isLow),
          getPosition: d => d.pos,
          getRadius: 7,
          getFillColor: [...PAPER, 1],
          radiusUnits: 'pixels',
          pickable: true,
        }),
        new ScatterplotLayer<CityView>({
          id: 'cities-globe',
          parameters: SURFACE_PARAMETERS,
          extensions: [horizonCull],
          data: this.cityViews.filter(v => !isLow(v)),
          getPosition: d => d.pos,
          getRadius: d => citySize(d.tier) * 0.3,
          getFillColor: [...INK, 255],
          getLineColor: [...PAPER, 255],
          getLineWidth: 1.6,
          stroked: true,
          radiusUnits: 'pixels',
          lineWidthUnits: 'pixels',
          pickable: true,
        }),
      );
    } else layers.push(
      // Landmarks and ruins lie beneath the living cities, so a town is never hidden under a sign.
      ...(['cities-low', 'cities'] as const).map(
        id =>
          new IconLayer<CityView>({
            id,
            parameters: SURFACE_PARAMETERS,
            extensions: [horizonCull],
            data: this.marks.filter(v => isLow(v) === (id === 'cities-low')),
            iconAtlas: this.atlas.url,
            iconMapping: this.atlas.mapping,
            getIcon: d => markIcon(d),
            getPosition: d => P(d.pos),
            getSize: d => markSize(d),
            getColor: d => [255, 255, 255, markAlpha(d)],
            sizeUnits: 'pixels',
            pickable: true,
            autoHighlight: false,
          }),
      ),
      new TextLayer<CityView>({
        id: 'city-labels',
        parameters: SURFACE_PARAMETERS,
        extensions: [horizonCull],
        data: this.labels.cities,
        getText: d => d.label,
        getPosition: d => P(d.pos),
        getSize: d => citySize(d.tier),
        getColor: d => (d.city.kind === 'natural' ? [...MOSS, 240] : d.status === 'living' ? [...INK, 245] : [...INK, d.status === 'lost' ? 120 : 165]),
        getTextAnchor: 'start',
        getAlignmentBaseline: 'center',
        getPixelOffset: d => [d.city.kind ? 9 : d.status === 'living' ? 7 + (3 - d.tier) : 8, 0],
        fontFamily: FONT_TEXT,
        characterSet: this.charset,
        fontSettings: {sdf: true, fontSize: 64, buffer: 10, radius: 14},
        outlineWidth: 4,
        outlineColor: [...PAPER, 215],
        sizeUnits: 'pixels',
      }),
      new TextLayer<CityView>({
        id: 'cities-water',
        parameters: SURFACE_PARAMETERS,
        extensions: [horizonCull],
        data: this.labels.waters,
        getText: d => d.label,
        getPosition: d => P(d.pos),
        getSize: d => waterSize(d),
        getColor: [...MOSS, 225],
        fontFamily: FONT_TEXT,
        // deck writes `${fontWeight} 64px ${fontFamily}`, so a style keyword here gives italics.
        fontWeight: 'italic',
        characterSet: this.charset,
        fontSettings: {sdf: true, fontSize: 64, buffer: 10, radius: 14},
        outlineWidth: 3,
        outlineColor: [...PAPER, 170],
        sizeUnits: 'pixels',
        pickable: true,
      }),
    );

    layers.push(...this.inventionLayers(state, P));
    layers.push(...this.routeLayers(routes, state, P));
    layers.push(...this.travellerLayers(others, state, PJ));
    if (geo) layers.push(...journeyLayers(geo, state, vpColor, now, PJ, globe ? paths => this.splitAtHorizon(paths) : paths => paths));
    return layers;
  }

  /** Everything with a mark on the map: water is lettered instead. */
  private get marks(): CityView[] {
    return this.cityViews.filter(v => v.city.subtype !== 'water');
  }

  /** Landmarks that run along a line, drawn along it on a paper casing: a wall in ink with battlement ticks, a
   * canal as a fine ink line, a canyon's river in moss. Shown with the landmark's mark, and clickable like it. */
  private landmarkPathLayers(state: State, P: (p: LngLat) => LngLat): Layer[] {
    /** `fade`: 1 for a standing course; for a fallen one, less the longer it has lain in ruin. */
    type Course = {points: LngLat[]; style: 'wall' | 'canal' | 'river'; ruin: boolean; fade: number};
    // Each course a landmark has drawn by this year: a plain one while it stands; for a phased one, every age's
    // works so far, in ink while that age lasts and faint once it has passed.
    const courses = (v: CityView): Course[] => {
      const path = v.city.path!;
      // A wall just abandoned still stands out; one left two thousand years is barely a trace.
      const fade = (fallen: number) => (fallen < 0 ? 1 : 0.28 + 0.72 * Math.exp(-fallen / 600));
      if (!path.phases) {
        const end = v.city.dates.abandoned;
        const fallen = end === undefined ? -1 : state.year - (typeof end === 'number' ? end : end[0]);
        return [{points: path.points as LngLat[], style: path.style, ruin: fallen >= 0, fade: fade(fallen)}];
      }
      return path.phases
        .filter(ph => ph.from <= state.year && (path.ended !== 'vanish' || state.year < (ph.to ?? Infinity)))
        .flatMap(ph => {
          const fallen = state.year - (ph.to ?? Infinity);
          return ph.paths.map(points => ({points: points as LngLat[], style: path.style, ruin: fallen >= 0, fade: fade(fallen)}));
        });
    };
    const copies = (path: LngLat[]) => (state.globe ? [path] : [-360, 0, 360].map(d => (d ? path.map(([x, y]) => [x + d, y] as LngLat) : path)));
    const split = state.globe ? (paths: LngLat[][]) => this.splitAtHorizon(paths) : (paths: LngLat[][]) => paths;
    type Line = CityView & {line: LngLat[]; style: Course['style']; ruin: boolean; fade: number};
    const data: Line[] = this.cityViews
      .filter(v => v.city.path)
      .flatMap(v => courses(v).flatMap(c => split(copies(c.points.map(P))).map(path => ({...v, line: cleanPath(path), style: c.style, ruin: c.ruin, fade: c.fade}))))
      .filter(d => d.line.length > 1)
      // Oldest ruins first, so newer works are drawn over the ones they follow.
      .sort((a, b) => a.fade - b.fade);
    if (!data.length) return [];
    const common = {parameters: SURFACE_PARAMETERS, getPath: (d: Line) => d.line, widthUnits: 'pixels' as const, jointRounded: true};
    const standing = data.filter(d => !d.ruin);
    return [
      new PathLayer<Line>({...common, id: 'cities-path-casing', data: standing, getColor: [...PAPER, 200], getWidth: d => (d.style === 'wall' ? 7 : 4.5), capRounded: true}),
      // Fallen works: a faint broken line, like the ruin sign.
      new PathLayer<Line>({
        ...common,
        id: 'cities-path-ruin',
        data: data.filter(d => d.ruin),
        getColor: d => [...INK, Math.round(130 * d.fade)],
        getWidth: d => 1 + 0.8 * d.fade,
        getDashArray: [2.5, 2],
        dashJustified: true,
        extensions: [DASHED],
        pickable: true,
        updateTriggers: {getColor: state.year, getWidth: state.year},
      } as ConstructorParameters<typeof PathLayer<Line>>[0]),
      new PathLayer<Line>({
        ...common,
        id: 'cities-path',
        data: standing,
        // A canal is water: a deep blue-grey, not the ink of a road or wall.
        getColor: d => (d.style === 'river' ? [...MOSS, 220] : d.style === 'canal' ? [...CANAL, 230] : [...INK, 200]),
        getWidth: d => (d.style === 'river' ? 2.2 : d.style === 'wall' ? 1.6 : 2),
        capRounded: true,
        pickable: true,
      }),
      // Battlements: a wide line cut into short dashes, so small teeth stand out on either side of the wall.
      new PathLayer<Line>({
        ...common,
        id: 'cities-path-teeth',
        data: standing.filter(d => d.style === 'wall'),
        getColor: [...INK, 190],
        getWidth: 5,
        getDashArray: [0.35, 0.9],
        dashJustified: true,
        extensions: [DASHED],
      } as ConstructorParameters<typeof PathLayer<Line>>[0]),
    ];
  }

  /** Every route the journey list matches, drawn whole and thin; the one under the pointer stands out. */
  private routeLayers(routes: RouteView[], state: State, P: (p: LngLat) => LngLat): Layer[] {
    if (!routes.length) return [];
    const copies = (path: LngLat[]) => (state.globe ? [path] : [-360, 0, 360].map(d => (d ? path.map(([x, y]) => [x + d, y] as LngLat) : path)));
    const split = state.globe ? (paths: LngLat[][]) => this.splitAtHorizon(paths) : (paths: LngLat[][]) => paths;
    const data = routes.flatMap(r =>
      split(r.paths.flatMap(p => copies(p.map(P))))
        .map(path => ({path: cleanPath(path), r}))
        .filter(d => d.path.length > 1),
    );
    return [
      new PathLayer<{path: LngLat[]; r: RouteView}>({
        id: 'routes',
        parameters: SURFACE_PARAMETERS,
        data,
        getPath: d => d.path,
        getColor: d => [...d.r.color, 175],
        getWidth: 1.8,
        widthUnits: 'pixels',
        widthMinPixels: 1.4,
        jointRounded: true,
        capRounded: true,
        pickable: true,
        autoHighlight: true,
        highlightColor: [...INK, 235],
      }),
    ];
  }

  /** Other travellers: a thin trail, a dot, and (when near enough to matter) the journey's name. */
  private travellerLayers(others: Traveller[], state: State, P: (p: LngLat) => LngLat): Layer[] {
    this.travellerLabels = others.filter(o => o.labelled);
    if (!others.length) return [];
    const split = state.globe ? (paths: LngLat[][]) => this.splitAtHorizon(paths) : (paths: LngLat[][]) => paths;
    const trails = others
      .flatMap(o => split(o.trail.map(t => t.map(P))).map(path => ({path: cleanPath(path), o})))
      .filter(d => d.path.length > 1);
    const a = (o: Traveller, k: number) => Math.round(k * o.alpha * (o.ghost ? 0.62 : 1));
    const out: Layer[] = [
      new PathLayer<{path: LngLat[]; o: Traveller}>({
        id: 'others-trail',
        parameters: SURFACE_PARAMETERS,
        data: trails,
        getPath: d => d.path,
        getColor: d => [...d.o.color, a(d.o, 200)],
        getWidth: d => (d.o.ghost ? 1.5 : 2),
        widthUnits: 'pixels',
        jointRounded: true,
        capRounded: true,
      }),
      new ScatterplotLayer<Traveller>({
        id: 'others',
        parameters: SURFACE_PARAMETERS,
        extensions: [horizonCull],
        data: others,
        getPosition: d => P(d.pos),
        getRadius: d => (d.ghost ? 4.2 : 5),
        getFillColor: d => (d.ghost ? [...PAPER, a(d, 240)] : [...d.color, a(d, 255)]),
        getLineColor: d => (d.ghost ? [...d.color, a(d, 255)] : [...PAPER, a(d, 255)]),
        getLineWidth: d => (d.ghost ? 2 : 1.6),
        stroked: true,
        radiusUnits: 'pixels',
        lineWidthUnits: 'pixels',
        pickable: true,
      }),
    ];
    if (!state.globe && this.travellerLabels.length) {
      out.push(
        new TextLayer<Traveller>({
          id: 'others-labels',
          parameters: SURFACE_PARAMETERS,
          extensions: [horizonCull],
          data: this.travellerLabels,
          getText: d => d.name,
          getPosition: d => P(d.pos),
          getSize: 13,
          getColor: d => [...d.color, a(d, 255)],
          getTextAnchor: 'start',
          getAlignmentBaseline: 'center',
          getPixelOffset: [9, 0],
          fontFamily: FONT_TEXT,
          fontWeight: 'italic',
          characterSet: this.charset,
          fontSettings: {sdf: true, fontSize: 64, buffer: 10, radius: 14},
          outlineWidth: 4,
          outlineColor: [...PAPER, 225],
          sizeUnits: 'pixels',
        }),
      );
    }
    return out;
  }

  /** Inventions mark their place of origin for a century after they appear, fading as they age. */
  private inventionLayers(state: State, P: (p: LngLat) => LngLat): Layer[] {
    const shown = visibleInventions(this.ctx.data.inventions, state);
    if (!shown.length) return [];
    const alpha = (d: InventionView) => (d.selected ? 255 : Math.round(255 - 150 * d.age));
    const key = shown.map(d => `${d.inv.id}${d.selected ? '*' : ''}${Math.round(d.age * 20)}`).join();
    if (state.globe) {
      return [
        new ScatterplotLayer<InventionView>({
          id: 'inventions-globe',
          parameters: SURFACE_PARAMETERS,
          extensions: [horizonCull],
          data: shown,
          getPosition: d => [d.inv.lon, d.inv.lat],
          getRadius: d => (d.selected ? 6.5 : 5),
          getFillColor: d => [...BRASS, alpha(d)],
          getLineColor: d => (d.selected ? [...RUBRIC, 255] : [...PAPER, alpha(d)]),
          getLineWidth: d => (d.selected ? 2.4 : 1.8),
          stroked: true,
          radiusUnits: 'pixels',
          lineWidthUnits: 'pixels',
          pickable: true,
          updateTriggers: {getFillColor: key, getLineColor: key, getRadius: key, getLineWidth: key},
        }),
      ];
    }
    const out: Layer[] = [
      new IconLayer<InventionView>({
        id: 'inventions',
        parameters: SURFACE_PARAMETERS,
        extensions: [horizonCull],
        data: shown,
        iconAtlas: this.atlas.url,
        iconMapping: this.atlas.mapping,
        getIcon: () => 'invention',
        getPosition: d => P([d.inv.lon, d.inv.lat]),
        getSize: d => (d.selected ? 22 : 17),
        getColor: d => [255, 255, 255, alpha(d)],
        sizeUnits: 'pixels',
        pickable: true,
        updateTriggers: {getSize: key, getColor: key},
      }),
    ];
    const labelled = shown.filter(d => d.selected || d.age < 0.2);
    if (labelled.length) {
      out.push(
        new TextLayer<InventionView>({
          id: 'invention-labels',
          parameters: SURFACE_PARAMETERS,
          extensions: [horizonCull],
          data: labelled,
          getText: d => tx.invention(d.inv.id, 'name', d.inv.name),
          getPosition: d => P([d.inv.lon, d.inv.lat]),
          getSize: 13,
          getColor: d => (d.selected ? [...RUBRIC, 255] : [...BRASS, 235]),
          getTextAnchor: 'middle',
          getAlignmentBaseline: 'top',
          getPixelOffset: [0, 12],
          fontFamily: FONT_TEXT,
          // deck writes `${fontWeight} 64px ${fontFamily}`, so a style keyword here gives italics.
          fontWeight: 'italic',
          characterSet: this.charset,
          fontSettings: {sdf: true, fontSize: 64, buffer: 10, radius: 14},
          outlineWidth: 4,
          outlineColor: [...PAPER, 225],
          sizeUnits: 'pixels',
          updateTriggers: {getColor: key},
        }),
      );
    }
    return out;
  }
}

export interface InventionView {
  inv: Invention;
  /** 0 when new, 1 a century later. */
  age: number;
  selected: boolean;
}

/** How long an invention keeps its mark on the map. */
const INVENTION_YEARS = 100;

export function visibleInventions(inventions: Invention[], state: State): InventionView[] {
  const out: InventionView[] = [];
  for (const inv of inventions) {
    const selected = state.invention === inv.id;
    const age = (state.year - inv.mid) / INVENTION_YEARS;
    if (selected || (!state.journey && age >= 0 && age < 1)) out.push({inv, age: Math.max(0, Math.min(1, age)), selected});
  }
  return out;
}

function journeyLayers(
  geo: JourneyGeo,
  state: State,
  vpColor: string,
  now: number,
  P: (p: LngLat) => LngLat,
  visible: (paths: LngLat[][]) => LngLat[][],
): Layer[] {
  const color = hexToRgb(vpColor);
  const {pos, trail, parties} = travelled(geo, state.progress);
  // The other parties of a split journey, travelling at the same time as the one followed.
  const others = parties.filter(p => !pos || p[0] !== pos[0] || p[1] !== pos[1]);
  // On the flat map the lines repeat a world-width either side, like the basemap, so a voyage that has
  // gone right round (the Challenger back in the Atlantic) still shows where it sailed first.
  const copies = (paths: LngLat[][]) =>
    state.globe ? paths : paths.flatMap(path => [-360, 0, 360].map(d => (d ? path.map(([x, y]) => [x + d, y] as LngLat) : path)));
  const tidy = (paths: LngLat[][]) => paths.map(cleanPath).filter(p => p.length > 1);
  const route = tidy(visible(copies(geo.legs.filter(l => l.onMap).map(l => l.points.map(P)))));
  const trailPaths = tidy(visible(copies(trail.map(t => t.map(P)))));
  const cur = currentStopIndex(geo, state.progress);
  const stops = geo.stops.filter(s => s.pos).map((s, _i, arr) => ({s, i: geo.stops.indexOf(s), n: arr.length}));
  const pulse = (now % 1800) / 1800;
  const out: Layer[] = [
    new PathLayer<LngLat[], PathStyleExtensionProps<LngLat[]>>({
      id: 'journey-route',
      data: route,
      getPath: d => d,
      getColor: [...color, 110],
      getWidth: 1.4,
      widthUnits: 'pixels',
      getDashArray: [3, 4],
      dashJustified: true,
      parameters: SURFACE_PARAMETERS,
      extensions: [DASHED],
      jointRounded: true,
      capRounded: true,
      updateTriggers: {getPath: state.globe},
    }),
    new PathLayer<LngLat[]>({
      id: 'journey-trail-halo',
      parameters: SURFACE_PARAMETERS,
      data: trailPaths,
      getPath: d => d,
      getColor: [...PAPER, 200],
      getWidth: 6.5,
      widthUnits: 'pixels',
      jointRounded: true,
      capRounded: true,
    }),
    new PathLayer<LngLat[]>({
      id: 'journey-trail',
      parameters: SURFACE_PARAMETERS,
      data: trailPaths,
      getPath: d => d,
      getColor: [...color, 245],
      getWidth: 2.6,
      widthUnits: 'pixels',
      jointRounded: true,
      capRounded: true,
    }),
    new ScatterplotLayer<(typeof stops)[number]>({
      id: 'journey-stops',
      parameters: SURFACE_PARAMETERS,
      extensions: [horizonCull],
      data: stops,
      getPosition: d => P(d.s.pos!),
      getRadius: d => (d.i === cur ? 6.5 : 4),
      getFillColor: d => (d.i <= cur ? [...color, 255] : [...PAPER, 255]),
      getLineColor: d => (d.i <= cur ? [...PAPER, 255] : [...color, 200]),
      getLineWidth: d => (d.i === cur ? 2 : 1.4),
      stroked: true,
      radiusUnits: 'pixels',
      lineWidthUnits: 'pixels',
      pickable: true,
      updateTriggers: {getRadius: cur, getFillColor: cur, getLineColor: cur, getLineWidth: cur, getPosition: state.globe},
    }),
  ];
  if (pos) {
    out.push(
      new ScatterplotLayer({
        id: 'journey-traveller-pulse',
        parameters: SURFACE_PARAMETERS,
        extensions: [horizonCull],
        data: [pos],
        getPosition: (d: LngLat) => P(d),
        getRadius: 7 + pulse * 16,
        getLineColor: [...color, Math.round(170 * (1 - pulse))],
        stroked: true,
        filled: false,
        getLineWidth: 1.5,
        radiusUnits: 'pixels',
        lineWidthUnits: 'pixels',
        updateTriggers: {getRadius: now, getLineColor: now},
      }),
      new ScatterplotLayer({
        id: 'journey-traveller',
        parameters: SURFACE_PARAMETERS,
        extensions: [horizonCull],
        data: [pos],
        getPosition: (d: LngLat) => P(d),
        getRadius: 6,
        getFillColor: [...color, 255],
        getLineColor: [...PAPER, 255],
        getLineWidth: 2.2,
        stroked: true,
        radiusUnits: 'pixels',
        lineWidthUnits: 'pixels',
      }),
    );
  }
  // The other parties: the same colour, a little smaller, without the pulse.
  if (others.length) {
    out.push(
      new ScatterplotLayer({
        id: 'journey-parties',
        parameters: SURFACE_PARAMETERS,
        extensions: [horizonCull],
        data: others,
        getPosition: (d: LngLat) => P(d),
        getRadius: 4.6,
        getFillColor: [...color, 235],
        getLineColor: [...PAPER, 255],
        getLineWidth: 1.8,
        stroked: true,
        radiusUnits: 'pixels',
        lineWidthUnits: 'pixels',
        updateTriggers: {getPosition: state.globe},
      }),
    );
  }
  return out;
}

/** Landmarks and ruins: drawn in their own lower layer, beneath the living cities. */
function isLow(v: CityView) {
  return !!v.city.kind || v.status !== 'living';
}

/** The sign for a place on the map; water has none (its name is lettered on it instead). */
function markIcon(v: CityView): string {
  if (v.status !== 'living') return v.status;
  return v.city.kind ? v.city.subtype ?? v.city.kind : `city${v.tier}`;
}

function markSize(v: CityView) {
  return v.city.kind && v.status === 'living' ? 15 - v.tier : v.status === 'living' ? citySize(v.tier) * 0.82 : 11;
}

function markAlpha(v: CityView) {
  return v.status === 'living' ? 255 : v.status === 'lost' ? 130 : 210;
}

/** Lakes and bays are lettered a little larger than towns, the greatest largest. */
function waterSize(v: CityView) {
  return v.tier === 1 ? 14 : 12.5;
}

export function citySize(tier: number) {
  return tier === 1 ? 14 : tier === 2 ? 12.5 : 11.5;
}

export function clampLat(lat: number, globe: boolean) {
  return globe ? lat : Math.max(-84.6, Math.min(84.6, lat));
}

/** Letter-spaced small caps for region names, the way engravers set them. */
/** Rough label width in ems: Latin letters about half an em, Chinese characters a full one. */
const ems = (text: string) => [...text].reduce((a, ch) => a + (ch.charCodeAt(0) > 0x2e80 ? 1 : 0.48), 0);

function spaced(text: string) {
  return [...text].join(' ');
}

const labelCellCache = new Map<string, number>();
function labelCell(grid: Grid, id: string, pos: LngLat): number {
  let c = labelCellCache.get(id);
  if (c === undefined) {
    c = cellAt(grid, pos[1], pos[0]);
    labelCellCache.set(id, c);
  }
  return c;
}
