import type { GraphPalette } from './generator/palette-algorithm';
import type { Dictionary } from './i18n/types';

export interface SupportQuery {
  question: string;
  answer: string;
  confidence: number;
}

export interface BrandKit {
  company: string;
  slug: string;
  locale: Dictionary['locale'];
  logoPath: string;
  palette: GraphPalette;
  catalogNames: string[];
  /**
   * Optional override for the documents cluster's hub names. Omitted by the generator today,
   * so a kit falls back to the dictionary's `docNames` — which are deliberately distinct from
   * `catalogNames` so the two clusters never display the same labels.
   */
  docNames?: string[];
  queries: SupportQuery[];
  seed: number;
  generatedAt: string;
  sourceUrl: string;
}

/** Throws with a message naming the missing/invalid field; never returns a partial kit. */
export function parseBrandKit(value: unknown): BrandKit {
  if (typeof value !== 'object' || value === null) throw new Error('BrandKit: not an object');
  const v = value as Record<string, unknown>;
  const required = ['company', 'slug', 'locale', 'logoPath', 'palette', 'catalogNames', 'queries', 'seed', 'generatedAt', 'sourceUrl'];
  for (const key of required) {
    if (!(key in v)) throw new Error(`BrandKit: missing required field "${key}"`);
  }
  if (v.locale !== 'es' && v.locale !== 'en') throw new Error(`BrandKit: unsupported locale "${String(v.locale)}"`);
  if (typeof v.palette !== 'object' || v.palette === null) throw new Error('BrandKit: palette must be an object');
  const palette = v.palette as Record<string, unknown>;
  for (const key of ['brand', 'clusterA', 'clusterB', 'stakes', 'answer', 'background', 'steel', 'usedFallback']) {
    if (!(key in palette)) throw new Error(`BrandKit: palette missing "${key}"`);
  }
  return v as unknown as BrandKit;
}

/** Fetches and validates `/kits/<slug>.json`. Throws (does not silently fall back) on any failure. */
export async function loadBrandKit(slug: string): Promise<BrandKit> {
  const res = await fetch(`/kits/${slug}.json`);
  if (!res.ok) throw new Error(`BrandKit: failed to fetch /kits/${slug}.json (${res.status})`);
  return parseBrandKit(await res.json());
}
