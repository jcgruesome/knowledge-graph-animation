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
      for (const label of Object.values(dict.labels)) expect(label).toBeTruthy();
      expect(dict.catalogNames.length).toBeGreaterThan(0);
      expect(dict.docNames.length).toBeGreaterThan(0);
    }
  });

  it('scene labels carry the placeholders schedule.ts substitutes', () => {
    for (const locale of ['es', 'en'] as const) {
      const { labels } = getDictionary(locale);
      expect(labels.catalogRoot).toContain('{count}');
      expect(labels.docsRoot).toContain('{count}');
      expect(labels.configRoot).toContain('{count}');
      expect(labels.hub).toContain('{name}');
      expect(labels.hub).toContain('{count}');
    }
  });

  it('catalog and document cluster names never collide', () => {
    for (const locale of ['es', 'en'] as const) {
      const dict = getDictionary(locale);
      const overlap = dict.docNames.filter((n) => dict.catalogNames.includes(n));
      expect(overlap).toEqual([]);
    }
  });

  it('es and en have different text for the same key', () => {
    expect(getDictionary('es').beats.dormant).not.toBe(getDictionary('en').beats.dormant);
  });
});
