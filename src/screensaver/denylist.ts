/**
 * Real customer names, brands and part numbers that must never appear in the screensaver.
 * Derived from the strings in src/queries.ts, src/i18n/*, and past prospect demos. Hard-coded on
 * purpose: the test and the bundle grep share this list, and nothing reads the real files at runtime.
 */
export const REAL_DENYLIST: readonly string[] = [
  'novanta', 'quick consult', 'item24',
  'kuka', 'fanuc', 'yaskawa', 'denso', 'universal robots', 'abb',
  'qc-11', 'qc-7', 'vg10', 'pg-70', 'wa-40', 'cd-25',
  'ur10e', 'ur5e', 'kr 10', 'crx-10ia', 'irb 1300', 'gp12', 'vs-087',
];

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PATTERN = new RegExp(`(?<![\\w-])(?:${REAL_DENYLIST.map(escape).join('|')})(?![\\w-])`, 'gi');

/** Case-insensitive matches on token boundaries (so `AWA-12` does not match `wa-40`-style prefixes). */
export function findDenied(text: string): string[] {
  return [...new Set([...text.matchAll(PATTERN)].map((m) => m[0].toLowerCase()))];
}
