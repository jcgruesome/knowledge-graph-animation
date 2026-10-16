import { describe, expect, it } from 'vitest';
import { parseBrandKit } from '../brandkit';
import { findDenied } from './denylist';
import { syntheticDictionary } from './dictionary';
import { generateSyntheticKit } from './kit';

/** ReshapeX token hues (design-system DESIGN.md): cyber blue, electric green, enterprise violet, enterprise blue, hot magenta, volt yellow. */
const FAMILY_HUES = [190, 74, 263, 203, 337, 54];
const CORE_HUES = [190, 74, 263, 203];

function hue(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return h * 60;
}
const distTo = (h: number, anchors: number[]): number =>
  Math.min(...anchors.map((a) => Math.min(Math.abs(h - a), 360 - Math.abs(h - a))));

describe('generateSyntheticKit', () => {
  it('is deterministic for a seed', () => {
    expect(generateSyntheticKit(42)).toEqual(generateSyntheticKit(42));
  });

  it('differs between seeds', () => {
    const a = generateSyntheticKit(42);
    const b = generateSyntheticKit(43);
    expect(a.palette.brand !== b.palette.brand || a.catalogNames.join() !== b.catalogNames.join()).toBe(true);
  });

  it.each([0, 1, 42, 4294967295])('seed %i yields a valid kit', (seed) => {
    const kit = generateSyntheticKit(seed);
    expect(() => parseBrandKit(kit)).not.toThrow();
    expect(kit.seed).toBe(seed);
    expect(kit.locale).toBe('en');
    expect(kit.logoPath).toBe('/reshapex-logo.svg');
    expect(kit.catalogNames.length).toBeGreaterThanOrEqual(5);
    expect(kit.docNames?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(kit.queries.length).toBeGreaterThanOrEqual(8);
    expect(kit.queries.every((q) => q.confidence === 1 && q.question && q.answer)).toBe(true);
  });

  it('never contains a real customer string, across 200 seeds', () => {
    for (let s = 0; s < 200; s++) {
      const hits = findDenied(JSON.stringify(generateSyntheticKit(s)));
      expect(hits, `seed ${s}`).toEqual([]);
    }
    expect(findDenied(JSON.stringify(syntheticDictionary))).toEqual([]);
  });

  it('stays in the ReshapeX palette family, across 200 seeds', () => {
    for (let s = 0; s < 200; s++) {
      const { palette } = generateSyntheticKit(s);
      expect(palette.usedFallback, `seed ${s}`).toBe(false);
      expect(distTo(hue(palette.brand), CORE_HUES), `brand seed ${s}`).toBeLessThanOrEqual(15);
      for (const key of ['clusterA', 'clusterB', 'stakes', 'answer'] as const) {
        expect(distTo(hue(palette[key]), FAMILY_HUES), `${key} seed ${s}`).toBeLessThanOrEqual(26);
      }
    }
  });
});

describe('findDenied', () => {
  it('flags real customer names and part numbers', () => {
    expect(findDenied('Novanta QC-11 VG10').sort()).toEqual(['novanta', 'qc-11', 'vg10']);
  });
  it('matches on word boundaries only', () => {
    expect(findDenied('AWA-12 and CRABBY')).toEqual([]);
  });
});
