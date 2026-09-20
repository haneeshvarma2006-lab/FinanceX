import { describe, expect, it } from 'vitest';
import { generateSessionToken, hashToken, safeEquals } from './tokens';

describe('session tokens', () => {
  it('produces a distinct high-entropy token each time', () => {
    const tokens = new Set(Array.from({ length: 500 }, generateSessionToken));
    expect(tokens.size).toBe(500);
  });

  it('is url-safe', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateSessionToken()).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it('carries at least 256 bits', () => {
    // base64url of 32 bytes is 43 characters with no padding.
    expect(generateSessionToken()).toHaveLength(43);
  });
});

describe('hashToken', () => {
  it('is deterministic and irreversible in shape', () => {
    const token = generateSessionToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).toHaveLength(64);
    expect(hashToken(token)).not.toContain(token);
  });

  it('separates distinct tokens', () => {
    expect(hashToken('a')).not.toBe(hashToken('b'));
  });
});

describe('safeEquals', () => {
  it('matches identical strings', () => {
    expect(safeEquals('abc', 'abc')).toBe(true);
  });

  it('rejects differing strings and lengths without throwing', () => {
    expect(safeEquals('abc', 'abd')).toBe(false);
    expect(safeEquals('abc', 'abcd')).toBe(false);
    expect(safeEquals('', 'a')).toBe(false);
  });
});
