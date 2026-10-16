import { loadBrandKit, type BrandKit } from './brandkit';

// The single seam main.ts reads its data through. The screensaver build aliases `@kg/runtime`
// to src/screensaver/runtime.ts so the real dictionaries and sample queries never enter its bundle.
export { getDictionary } from './i18n';
export { DEFAULT_QUERIES } from './queries';

/** A BrandKit (loaded via ?kit=<slug>) overrides locale, palette, queries, logo, and seed. */
export async function resolveKit(): Promise<BrandKit | null> {
  const slug = new URLSearchParams(location.search).get('kit');
  return slug ? loadBrandKit(slug) : null;
}
