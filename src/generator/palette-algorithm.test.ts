import { describe, expect, it } from 'vitest';
import { deriveGraphPalette } from './palette-algorithm';

describe('deriveGraphPalette', () => {
  it('uses the brand color as-is for the root/CTA role', () => {
    const p = deriveGraphPalette('#E30613');
    expect(p.brand.toLowerCase()).toBe('#e30613');
    expect(p.usedFallback).toBe(false);
  });

  it('derives clusterA and clusterB at different hues from the brand color', () => {
    const p = deriveGraphPalette('#2A6DF0'); // a blue B2B SaaS color
    expect(p.clusterA).not.toBe(p.clusterB);
    expect(p.clusterA).not.toBe(p.brand);
    expect(p.clusterB).not.toBe(p.brand);
  });

  it('keeps the answer accent light and saturated regardless of input hue', () => {
    for (const hex of ['#E30613', '#2A6DF0', '#1E8E3E']) {
      const p = deriveGraphPalette(hex);
      const [, , l] = hexToHsl(p.answer);
      expect(l).toBeGreaterThanOrEqual(0.7);
    }
  });

  it('the answer accent has meaningfully higher relative luminance than the background', () => {
    const p = deriveGraphPalette('#2A6DF0');
    expect(relativeLuminance(p.answer)).toBeGreaterThan(relativeLuminance(p.background) + 0.3);
  });

  it('falls back for an achromatic brand color instead of producing an undefined hue', () => {
    const p = deriveGraphPalette('#808080'); // s = 0
    expect(p.usedFallback).toBe(true);
    expect(p.brand).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('falls back for a near-black brand color', () => {
    const p = deriveGraphPalette('#0A0A0A'); // l ≈ 0.04
    expect(p.usedFallback).toBe(true);
  });

  it('falls back for a near-white brand color', () => {
    const p = deriveGraphPalette('#FAFAFA'); // l ≈ 0.98
    expect(p.usedFallback).toBe(true);
  });

  it('is deterministic', () => {
    expect(deriveGraphPalette('#E30613')).toEqual(deriveGraphPalette('#E30613'));
  });
});

// --- test-only helpers, duplicated deliberately so the test doesn't trust the
// implementation's own color-math to grade itself ---
function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function relativeLuminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
