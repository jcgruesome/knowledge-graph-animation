export function companyToSlug(company: string): string {
  return company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** FNV-1a, deterministic, salted by seedVariant for an intentional do-over. */
export function companyToSeed(company: string, seedVariant: number): number {
  let hash = 0x811c9dc5;
  const input = `${company}::${seedVariant}`;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
