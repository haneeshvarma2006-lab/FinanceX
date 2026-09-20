import { describe, expect, it } from 'vitest';
import { hashState, safeRedirectPath } from './oauth';

describe('safeRedirectPath', () => {
  it('keeps a plain same-origin path', () => {
    expect(safeRedirectPath('/finance')).toBe('/finance');
    expect(safeRedirectPath('/trading/trades?filter=open')).toBe('/trading/trades?filter=open');
  });

  it('falls back when nothing is supplied', () => {
    expect(safeRedirectPath(null)).toBe('/today');
    expect(safeRedirectPath(undefined)).toBe('/today');
    expect(safeRedirectPath('')).toBe('/today');
  });

  it('refuses absolute URLs, which would be an open redirect', () => {
    for (const hostile of [
      'https://evil.example/phish',
      'http://evil.example',
      '//evil.example',
      '///evil.example',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      '/\\evil.example',
      '/\t/evil.example',
    ]) {
      expect(safeRedirectPath(hostile), `${hostile} must not be honoured`).toBe('/today');
    }
  });

  it('refuses a scheme smuggled behind a leading slash', () => {
    expect(safeRedirectPath('/https://evil.example')).toBe('/today');
    expect(safeRedirectPath('//https://evil.example')).toBe('/today');
  });
});

describe('hashState', () => {
  it('is deterministic and does not contain the input', () => {
    const state = 'a-random-state-value';
    expect(hashState(state)).toBe(hashState(state));
    expect(hashState(state)).toHaveLength(64);
    expect(hashState(state)).not.toContain(state);
  });
});
