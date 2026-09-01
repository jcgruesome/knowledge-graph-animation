/** One graph-legible palette, algorithmically derived from a single extracted brand color. */
export interface GraphPalette {
  brand: string;
  clusterA: string;
  clusterB: string;
  stakes: string;
  answer: string;
  background: string;
  steel: string;
  /** true if the input color was achromatic or extreme-lightness and a curated default was used instead */
  usedFallback: boolean;
}

/** ReshapeX's own baseline hue, used when the extracted brand color can't anchor a hue rotation. */
const FALLBACK_HUE = 195; // cyan, matches the original ReshapeX marketing palette

interface Hsl {
  h: number; // 0-360
  s: number; // 0-1
  l: number; // 0-1
}

function hexToHsl(hex: string): Hsl {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s, l };
}

function hslToHex({ h, s, l }: Hsl): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let [r, g, b] = [0, 0, 0];
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  const toHex = (v: number): string => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const normHue = (h: number): number => ((h % 360) + 360) % 360;

/** Rules-based derivation. See docs/superpowers/specs/2026-09-01-prospect-demo-generator-design.md#palette-algorithm. */
export function deriveGraphPalette(brandHex: string): GraphPalette {
  const raw = hexToHsl(brandHex);
  const usedFallback = raw.s < 0.08 || raw.l < 0.1 || raw.l > 0.9;
  const anchor: Hsl = usedFallback ? { h: FALLBACK_HUE, s: 0.75, l: 0.48 } : raw;

  const brand = usedFallback ? hslToHex(anchor) : brandHex;
  const clusterA = hslToHex({ h: normHue(anchor.h + 25), s: anchor.s, l: anchor.l });
  const clusterB = hslToHex({ h: normHue(anchor.h - 20), s: anchor.s, l: clamp01(anchor.l * 0.65) });
  const stakes = hslToHex({ h: normHue(anchor.h + (330 - anchor.h > 180 ? -30 : 30)), s: Math.max(anchor.s, 0.7), l: anchor.l });
  const answer = hslToHex({ h: normHue(anchor.h + 150), s: Math.max(anchor.s, 0.6), l: Math.max(anchor.l, 0.75) });
  const background = hslToHex({ h: anchor.h, s: 0.15, l: 0.08 });
  const steel = hslToHex({ h: anchor.h, s: 0.08, l: 0.55 });

  return { brand, clusterA, clusterB, stakes, answer, background, steel, usedFallback };
}
