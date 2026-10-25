export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? [...h].map(c => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const rgb01 = (hex: string): [number, number, number] => hexToRgb(hex).map(v => v / 255) as [number, number, number];

export function mixHex(a: string, b: string, t: number, darken = 0): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const c = A.map((v, i) => Math.round((v + (B[i] - v) * t) * (1 - darken)));
  return `#${c.map(v => v.toString(16).padStart(2, '0')).join('')}`;
}
