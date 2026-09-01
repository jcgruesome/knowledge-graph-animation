import { describe, expect, it } from 'vitest';
import { getDictionary } from './index';

describe('getDictionary', () => {
  it('returns a complete dictionary for es and en', () => {
    for (const locale of ['es', 'en'] as const) {
      const dict = getDictionary(locale);
      expect(dict.beats.dormant).toBeTruthy();
      expect(dict.voice.length).toBeGreaterThan(0);
      expect(dict.hud.searchPlaceholder).toBeTruthy();
      expect(dict.events.queryLanded).toBeTruthy();
    }
  });

  it('es and en have different text for the same key', () => {
    expect(getDictionary('es').beats.dormant).not.toBe(getDictionary('en').beats.dormant);
  });
});
