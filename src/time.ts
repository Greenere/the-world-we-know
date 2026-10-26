// Year formatting and the two timeline scales.

import {isZh} from './i18n';

export const PRESENT = 2026;
/** Where the main timeline begins: the Bronze Age world of Egypt, Babylon and the Shang. */
export const START = -2000;

const grouped = (n: number) => n.toLocaleString('en-US');

/** Chinese: 4.5万年前 rather than 45,000. */
const wan = (n: number) => (n >= 10000 ? `${+(n / 10000).toFixed(1)}万` : String(n));

/** "126 BCE", "97 CE", "1420", "45,000 years ago" (公元前126年, 97年, 1420年, 4.5万年前). Negative years are BCE. */
export function formatYear(y: number): string {
  const r = Math.round(y);
  if (isZh()) {
    if (r <= -10000) return `${wan(Math.round((PRESENT - r) / 1000) * 1000)}年前`;
    if (r < 0) return `公元前${-r}年`;
    return `${r === 0 ? 1 : r}年`;
  }
  if (r <= -10000) return `${grouped(Math.round((PRESENT - r) / 1000) * 1000)} years ago`;
  if (r < 0) return `${grouped(-r)} BCE`;
  if (r === 0) return '1 CE';
  if (r < 1000) return `${r} CE`;
  return String(r);
}

/** The year in two parts for the big display. In Chinese the era comes first (`pre`): 公元前 325. */
export function yearParts(y: number): {num: string; era: string; pre?: boolean} {
  const r = Math.round(y);
  if (isZh()) {
    if (r <= -10000) return {num: wan(Math.round((PRESENT - r) / 1000) * 1000), era: '年前'};
    if (r < 0) return {num: String(-r), era: '公元前', pre: true};
    return {num: String(r === 0 ? 1 : r), era: r < 1000 ? '公元' : '', pre: true};
  }
  if (r <= -10000) return {num: grouped(Math.round((PRESENT - r) / 1000) * 1000), era: 'years ago'};
  if (r < 0) return {num: grouped(-r), era: 'BCE'};
  if (r === 0) return {num: '1', era: 'CE'};
  return {num: String(r), era: r < 1500 ? 'CE' : ''};
}

export function formatRange(y: number | [number, number]): string {
  if (typeof y === 'number') return formatYear(y);
  const [a, b] = y;
  if (isZh()) {
    if (a < 0 && b < 0) return `约公元前${-a}–前${-b}年`;
    if (a < 0) return `约公元前${-a}年–公元${b}年`;
    return `约${a}–${b}年`;
  }
  if (a < 0 && b < 0) return `c. ${grouped(-a)}–${grouped(-b)} BCE`;
  if (a < 0) return `c. ${grouped(-a)} BCE – ${b} CE`;
  return `c. ${a}–${b}`;
}

export interface Tick {
  year: number;
  label?: string;
  major: boolean;
}

export interface TimeScale {
  kind: 'main' | 'deep';
  min: number;
  max: number;
  toX(year: number): number;
  fromX(x: number): number;
  ticks(): Tick[];
}

/** 2000 BCE to today: the Bronze and Iron Ages compressed, extra room per year for the crowded recent centuries. */
function piecewise(knots: [number, number][]): Pick<TimeScale, 'toX' | 'fromX'> {
  const total = knots[knots.length - 1][1];
  return {
    toX(year) {
      if (year <= knots[0][0]) return 0;
      for (let i = 1; i < knots.length; i++) {
        const [y1, w1] = knots[i];
        const [y0, w0] = knots[i - 1];
        if (year <= y1) return (w0 + ((year - y0) / (y1 - y0)) * (w1 - w0)) / total;
      }
      return 1;
    },
    fromX(x) {
      const w = Math.min(1, Math.max(0, x)) * total;
      for (let i = 1; i < knots.length; i++) {
        const [y1, w1] = knots[i];
        const [y0, w0] = knots[i - 1];
        if (w <= w1) return y0 + ((w - w0) / (w1 - w0)) * (y1 - y0);
      }
      return knots[knots.length - 1][0];
    },
  };
}

const mainMap = piecewise([
  [START, 0],
  [-500, 600],
  [1400, 2500],
  [1800, 3140],
  [1900, 3390],
  [PRESENT, 4020],
]);

export const mainScale: TimeScale = {
  kind: 'main',
  min: START,
  max: PRESENT,
  ...mainMap,
  ticks() {
    const t: Tick[] = [];
    for (let y = START; y < -500; y += 250) t.push({year: y, major: y % 1000 === 0});
    for (let y = -500; y < 1800; y += 100) t.push({year: y, major: y % 500 === 0});
    for (let y = 1800; y < 1900; y += 25) t.push({year: y, major: y === 1800});
    for (let y = 1900; y <= 2020; y += 10) t.push({year: y, major: y % 50 === 0});
    const zh = isZh();
    const labels: Record<number, string> = {
      [-2000]: zh ? '前2000' : '2000 BCE',
      [-1000]: zh ? '前1000' : '1000 BCE',
      [-500]: zh ? '前500' : '500 BCE',
      0: zh ? '公元1' : '1 CE',
      500: '500',
      1000: '1000',
      1500: '1500',
      1800: '1800',
      1900: '1900',
      1950: '1950',
      2000: '2000',
    };
    for (const tick of t) {
      if (labels[tick.year]) {
        tick.label = labels[tick.year];
        tick.major = true;
      }
    }
    return t;
  },
};

/** Humanity's compressed scale: logarithmic in years before present, back to 70,000 years ago. */
const DEEP_MIN = -70000;
const C = 100;
const L = (bp: number) => Math.log(bp + C);
const LMAX = L(PRESENT - DEEP_MIN);
const LMIN = L(0);

export const deepScale: TimeScale = {
  kind: 'deep',
  min: DEEP_MIN,
  max: PRESENT,
  toX(year) {
    const bp = Math.max(0, PRESENT - Math.min(PRESENT, Math.max(DEEP_MIN, year)));
    return (LMAX - L(bp)) / (LMAX - LMIN);
  },
  fromX(x) {
    const l = LMAX - Math.min(1, Math.max(0, x)) * (LMAX - LMIN);
    return PRESENT - (Math.exp(l) - C);
  },
  ticks() {
    const zh = isZh();
    const labelled: [number, string][] = [
      [-70000, zh ? '7万年前' : '70,000 years ago'],
      [-20000, zh ? '2万' : '20,000'],
      [-8000, zh ? '1万' : '10,000'],
      [-3000, zh ? '前3000' : '3000 BCE'],
      [0, zh ? '公元1' : '1 CE'],
      [1000, '1000'],
      [1500, '1500'],
      [1800, '1800'],
      [1900, '1900'],
      [1969, '1969'],
    ];
    const t: Tick[] = labelled.map(([year, label]) => ({year, label, major: true}));
    for (const y of [-60000, -50000, -40000, -30000, -15000, -5000, -2000, -1000, 500, 1250, 1700, 1950, 2000]) {
      t.push({year: y, major: false});
    }
    return t;
  },
};
