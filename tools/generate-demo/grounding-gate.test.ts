import { describe, expect, it } from 'vitest';
import { applyGroundingGate, GroundingGateError } from './grounding-gate';

describe('applyGroundingGate', () => {
  it('keeps items at or above the threshold, drops the rest', () => {
    const items = [
      { item: 'a', confidence: 0.9 },
      { item: 'b', confidence: 0.5 },
      { item: 'c', confidence: 0.61 },
    ];
    expect(applyGroundingGate(items, { minSurvivors: 2 })).toEqual(['a', 'c']);
  });

  it('defaults the threshold to 0.6', () => {
    const items = [{ item: 'a', confidence: 0.6 }, { item: 'b', confidence: 0.59 }];
    expect(applyGroundingGate(items, { minSurvivors: 1 })).toEqual(['a']);
  });

  it('throws GroundingGateError when too few survive', () => {
    const items = [{ item: 'a', confidence: 0.1 }, { item: 'b', confidence: 0.2 }];
    expect(() => applyGroundingGate(items, { minSurvivors: 1 })).toThrow(GroundingGateError);
  });

  it('the thrown error names how many survived vs. required', () => {
    const items = [{ item: 'a', confidence: 0.1 }];
    try {
      applyGroundingGate(items, { minSurvivors: 8 });
      throw new Error('expected applyGroundingGate to throw');
    } catch (e) {
      expect(String(e)).toMatch(/0.*8/);
    }
  });
});
