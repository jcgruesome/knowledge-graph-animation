import { describe, expect, it, vi, beforeEach } from 'vitest';
import { applyKitOverrides, parseBrandKit } from './brandkit';
import { getDictionary } from './i18n';
import { buildGraph } from './graph';
import { buildSchedule } from './schedule';

// graph.ts reads localStorage for layout caching; stub it for Node.
(globalThis as any).localStorage = {
  store: new Map<string, string>(),
  getItem(k: string) { return this.store.get(k) ?? null; },
  setItem(k: string, v: string) { this.store.set(k, v); },
  removeItem(k: string) { this.store.delete(k); },
};

const VALID_KIT = {
  company: 'Acme Corp',
  slug: 'acme-corp',
  locale: 'en',
  logoPath: '/kits/acme-corp/logo.svg',
  palette: {
    brand: '#2A6DF0', clusterA: '#2A6DF0', clusterB: '#2A6DF0', stakes: '#2A6DF0',
    answer: '#2A6DF0', background: '#2A6DF0', steel: '#2A6DF0', usedFallback: false,
  },
  catalogNames: ['A', 'B', 'C', 'D', 'E'],
  queries: [{ question: 'Q1', answer: 'A1', confidence: 0.9 }],
  seed: 12345,
  generatedAt: '2026-09-01T00:00:00.000Z',
  sourceUrl: 'https://acme.example.com',
};

describe('parseBrandKit', () => {
  it('accepts a well-formed kit', () => {
    expect(() => parseBrandKit(VALID_KIT)).not.toThrow();
    expect(parseBrandKit(VALID_KIT).slug).toBe('acme-corp');
  });

  it('rejects a kit missing required fields', () => {
    const { palette, ...broken } = VALID_KIT;
    expect(() => parseBrandKit(broken)).toThrow(/palette/);
  });

  it('rejects an unsupported locale', () => {
    expect(() => parseBrandKit({ ...VALID_KIT, locale: 'fr' })).toThrow(/locale/);
  });
});

describe('kit labels', () => {
  const dict = getDictionary('en');
  const render = (kit: unknown) => {
    const parsed = parseBrandKit(kit);
    return buildSchedule(buildGraph(parsed.seed, 1), parsed.seed, applyKitOverrides(dict, parsed)).labels.map((l) => l.text);
  };
  const LABELS = { catalogRoot: 'Acme parts · {count} SKUs', hub: '{name} · {count} items' };

  it('a kit with labels renders them on the root and hub scene labels', () => {
    const texts = render({ ...VALID_KIT, labels: LABELS });
    expect(texts.some((t) => /^Acme parts · \d+ SKUs$/.test(t))).toBe(true);
    expect(texts.some((t) => / · \d+ items$/.test(t))).toBe(true);
    expect(texts.some((t) => t.includes('Tooling catalog'))).toBe(false);
    expect(texts.some((t) => t.includes('modules'))).toBe(false);
    // keys the kit omits keep the default
    expect(texts.some((t) => t.startsWith('Configurations · '))).toBe(true);
  });

  it('a kit without labels renders exactly as the dictionary defaults', () => {
    const base = buildSchedule(buildGraph(VALID_KIT.seed, 1), VALID_KIT.seed, { ...dict, catalogNames: VALID_KIT.catalogNames }).labels.map((l) => l.text);
    expect(render(VALID_KIT)).toEqual(base);
  });

  it('rejects unknown keys, empty values and dropped placeholders', () => {
    expect(() => parseBrandKit({ ...VALID_KIT, labels: { nope: 'x' } })).toThrow(/unknown label "nope"/);
    expect(() => parseBrandKit({ ...VALID_KIT, labels: { hub: '' } })).toThrow(/non-empty/);
    expect(() => parseBrandKit({ ...VALID_KIT, labels: { hub: '{name} only' } })).toThrow(/\{count\}/);
    expect(() => parseBrandKit({ ...VALID_KIT, labels: ['x'] })).toThrow(/object/);
  });
});
