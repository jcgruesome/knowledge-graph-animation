import { describe, expect, it } from 'vitest';
import { previewLink, selectHeldBack } from './deploy';

describe('selectHeldBack', () => {
  it('ignores dotfiles and the current slug, holds other kits and dirs', () => {
    expect(selectHeldBack(['.gitkeep', 'acme.json', 'acme', 'other.json', 'other'], 'acme')).toEqual(['other.json', 'other']);
  });
  it('holds back dotfiles other than .gitkeep', () => {
    expect(selectHeldBack(['.gitkeep', '.env', '.DS_Store', 'acme.json'], 'acme')).toEqual(['.env', '.DS_Store']);
  });

  it('holds nothing when only .gitkeep and the current kit exist', () => {
    expect(selectHeldBack(['.gitkeep', 'acme.json'], 'acme')).toEqual([]);
  });
});

describe('previewLink', () => {
  it('omits density at the default and carries it otherwise', () => {
    expect(previewLink('https://x.vercel.app', 'acme', 1)).toBe('https://x.vercel.app/?kit=acme');
    expect(previewLink('https://x.vercel.app', 'acme', 3)).toBe('https://x.vercel.app/?kit=acme&density=3');
  });
});
