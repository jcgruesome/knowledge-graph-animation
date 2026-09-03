import { describe, expect, it, vi, beforeEach } from 'vitest';
import { parseBrandKit } from './brandkit';

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
