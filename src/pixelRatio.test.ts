import { describe, expect, it } from 'vitest';
import { pixelRatioFor } from './pixelRatio';

describe('pixelRatioFor', () => {
  it('caps at 2 and at the device ratio when no budget is set', () => {
    expect(pixelRatioFor(3, 1920, 1080, Infinity)).toBe(2);
    expect(pixelRatioFor(1, 1920, 1080, Infinity)).toBe(1);
  });
  it('shrinks the ratio so width*height*ratio^2 fits the pixel budget', () => {
    const r = pixelRatioFor(2, 7680, 2160, 4_000_000);
    expect(r * r * 7680 * 2160).toBeCloseTo(4_000_000, -3);
  });
  it('never exceeds the device ratio when the budget is generous', () => {
    expect(pixelRatioFor(2, 800, 600, 50_000_000)).toBe(2);
  });
});
