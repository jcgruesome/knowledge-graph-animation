import { describe, expect, it } from 'vitest';
import { parseSeed } from './seed';

describe('parseSeed', () => {
  it.each(['', '?seed=', '?seed=abc', '?seed=-1', '?seed=1.5', '?seed=4294967296', '?density=1'])(
    'throws for %j',
    (search) => {
      expect(() => parseSeed(search)).toThrow('screensaver: missing or invalid seed');
    },
  );

  it('accepts the full uint32 range', () => {
    expect(parseSeed('?seed=0')).toBe(0);
    expect(parseSeed('?seed=4294967295')).toBe(4294967295);
  });

  it('ignores other params', () => {
    expect(parseSeed('?seed=42&density=1')).toBe(42);
  });
});
