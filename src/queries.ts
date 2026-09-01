import type { SupportQuery } from './brandkit';

export type { SupportQuery };

/** Fallback when no BrandKit is loaded: a kit always supplies its own queries. */
export const DEFAULT_QUERIES: SupportQuery[] = [];
