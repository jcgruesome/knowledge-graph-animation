import { describe, expect, it } from 'vitest';
import { buildGraph } from './graph';

// graph.ts reads localStorage for layout caching; stub it for Node.
(globalThis as any).localStorage = {
  store: new Map<string, string>(),
  getItem(k: string) { return this.store.get(k) ?? null; },
  setItem(k: string, v: string) { this.store.set(k, v); },
  removeItem(k: string) { this.store.delete(k); },
};

function hubCount(seed: number): number {
  return buildGraph(seed, 1).clusters[0]!.hubs.length;
}

describe('buildGraph structural randomization', () => {
  it('two different seeds at the same density produce different hub counts', () => {
    const counts = new Set([hubCount(1), hubCount(2), hubCount(3), hubCount(4), hubCount(5)]);
    expect(counts.size).toBeGreaterThan(1);
  });

  it('the same seed is reproducible', () => {
    expect(hubCount(42)).toBe(hubCount(42));
  });

  it('hub counts stay within a sane range around the density-1 baseline (58)', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const count = hubCount(seed);
      expect(count).toBeGreaterThanOrEqual(40);
      expect(count).toBeLessThanOrEqual(80);
    }
  });
});
