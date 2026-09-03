import { describe, expect, it } from 'vitest';
import { companyToSlug, companyToSeed } from './slug';

describe('companyToSlug', () => {
  it('lowercases, strips punctuation, hyphenates spaces', () => {
    expect(companyToSlug('Acme Corp.')).toBe('acme-corp');
  });
});

describe('companyToSeed', () => {
  it('is deterministic', () => {
    expect(companyToSeed('Acme Corp', 0)).toBe(companyToSeed('Acme Corp', 0));
  });

  it('a nonzero seed-variant changes the seed', () => {
    expect(companyToSeed('Acme Corp', 0)).not.toBe(companyToSeed('Acme Corp', 1));
  });
});
