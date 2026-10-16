import type { BrandKit, SupportQuery } from '../brandkit';
import { deriveGraphPalette } from '../generator/palette-algorithm';
import { Random } from '../random';
import { APPLICATIONS, CATALOG_FAMILIES, COMPANIES, DOC_FAMILIES, EQUIPMENT, SKU_PREFIXES } from './banks';

/** ReshapeX core brand hues (design-system DESIGN.md): cyber blue, electric green, enterprise violet, enterprise blue. */
const ANCHOR_HUES = [190, 74, 263, 203];
/** Core plus stakes (hot magenta 337) and answer (volt yellow 54): derived colors must stay near one of these. */
const FAMILY_HUES = [...ANCHOR_HUES, 337, 54];
const HUE_JITTER = 10;
const MAX_FAMILY_DRIFT = 24;

function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

/** Rotates a color's hue back to within MAX_FAMILY_DRIFT of the nearest ReshapeX family hue. */
function clampToFamily(hex: string): string {
  const [h, s, l] = hexToHsl(hex);
  const signed = (a: number): number => ((a - h + 540) % 360) - 180; // anchor minus h, in (-180, 180]
  const nearest = FAMILY_HUES.reduce((best, a) => (Math.abs(signed(a)) < Math.abs(signed(best)) ? a : best));
  const off = signed(nearest);
  if (Math.abs(off) <= MAX_FAMILY_DRIFT) return hex;
  return hslToHex(off > 0 ? nearest - MAX_FAMILY_DRIFT : nearest + MAX_FAMILY_DRIFT, s, l);
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return `#${[r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('')}`;
}

function sku(rng: Random): string {
  return `${rng.pick(SKU_PREFIXES)}-${10 + rng.int(90)}`;
}

function query(rng: Random, families: string[]): SupportQuery {
  const equipment = rng.pick(EQUIPMENT);
  const payload = 3 + rng.int(18);
  const [a, b] = [rng.pick(families), rng.pick(families)];
  return {
    question: `customer query · ${equipment} · ${payload} kg · ${rng.pick(APPLICATIONS)}`,
    answer: `${a} ${sku(rng)} + ${b} ${sku(rng)} · ${payload + 2 + rng.int(4)} kg rated · ${equipment} interface verified`,
    confidence: 1,
  };
}

/** A fully synthetic BrandKit: deterministic per seed, ReshapeX-family palette, no real customer data. */
export function generateSyntheticKit(seed: number): BrandKit {
  const rng = new Random(seed);
  const hue = rng.pick(ANCHOR_HUES) + rng.range(-HUE_JITTER, HUE_JITTER);
  const derived = deriveGraphPalette(hslToHex(hue, rng.range(0.7, 0.9), rng.range(0.45, 0.55)));
  const palette = {
    ...derived,
    clusterA: clampToFamily(derived.clusterA),
    clusterB: clampToFamily(derived.clusterB),
    stakes: clampToFamily(derived.stakes),
    answer: clampToFamily(derived.answer),
  };
  const catalogNames = rng.shuffle([...CATALOG_FAMILIES]).slice(0, 8);
  const docNames = rng.shuffle([...DOC_FAMILIES]).slice(0, 3);
  return {
    company: rng.pick(COMPANIES),
    slug: `synthetic-${seed}`,
    locale: 'en',
    logoPath: '',
    palette,
    catalogNames,
    docNames,
    queries: Array.from({ length: 10 }, () => query(rng, catalogNames)),
    seed,
    generatedAt: new Date(0).toISOString(),
    sourceUrl: 'synthetic',
  };
}
