/** Reads the required `?seed=` (uint32). Throws rather than defaulting: a screensaver must never silently show the same graph. */
export function parseSeed(search: string): number {
  const raw = new URLSearchParams(search).get('seed');
  const seed = raw === null || raw === '' ? NaN : Number(raw);
  if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) throw new Error('screensaver: missing or invalid seed');
  return seed;
}
