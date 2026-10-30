import type { GraphPalette } from './generator/palette-algorithm';
import { getDictionary } from './i18n';
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
  /**
   * Optional overrides for the in-scene root labels (`catalogRoot`, `docsRoot`, `configRoot`, `hub`).
   * Each value must keep the placeholders of the dictionary default it replaces. Omitted keys, and
   * kits without this field, render the dictionary's ReshapeX defaults.
   */
  labels?: Partial<Dictionary['labels']>;
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
  if (v.labels !== undefined) parseLabels(v.labels, v.locale);
  return v as unknown as BrandKit;
}

function parseLabels(value: unknown, locale: Dictionary['locale']): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('BrandKit: labels must be an object');
  const defaults: Record<string, string> = getDictionary(locale).labels;
  for (const [key, text] of Object.entries(value)) {
    const base = defaults[key];
    if (base === undefined) throw new Error(`BrandKit: unknown label "${key}"`);
    if (typeof text !== 'string' || !text.trim()) throw new Error(`BrandKit: label "${key}" must be a non-empty string`);
    for (const placeholder of base.match(/\{\w+\}/g) ?? []) {
      if (!text.includes(placeholder)) throw new Error(`BrandKit: label "${key}" must contain ${placeholder}`);
    }
  }
}

/** The dictionary a kit renders with: its cluster names and root labels over the built-in defaults. */
export function applyKitOverrides(dict: Dictionary, kit: BrandKit | null): Dictionary {
  return {
    ...dict,
    ...(kit?.catalogNames?.length ? { catalogNames: kit.catalogNames } : {}),
    ...(kit?.docNames?.length ? { docNames: kit.docNames } : {}),
    labels: { ...dict.labels, ...kit?.labels },
  };
}

/** Fetches and validates `/kits/<slug>.json`. Throws (does not silently fall back) on any failure. */
export async function loadBrandKit(slug: string): Promise<BrandKit> {
  const res = await fetch(`/kits/${slug}.json`);
  if (!res.ok) throw new Error(`BrandKit: failed to fetch /kits/${slug}.json (${res.status})`);
  return parseBrandKit(await res.json());
}
