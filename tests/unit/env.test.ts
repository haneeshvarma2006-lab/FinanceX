import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getEnv, resetEnvCache } from '@/lib/env';

/**
 * M0 acceptance: the process must refuse to start on a missing or malformed
 * secret, with a message that says which one.
 */

const original = { ...process.env };

beforeEach(resetEnvCache);
afterEach(() => {
  process.env = { ...original };
  resetEnvCache();
});

describe('environment contract', () => {
  it('accepts a complete environment', () => {
    expect(() => getEnv()).not.toThrow();
  });

  it('refuses a missing DATABASE_URL and names it', () => {
    delete process.env.DATABASE_URL;
    expect(() => getEnv()).toThrow(/DATABASE_URL/);
  });

  it('refuses a DATABASE_URL that is not a URL', () => {
    process.env.DATABASE_URL = 'localhost:5432';
    expect(() => getEnv()).toThrow(/DATABASE_URL/);
  });

  it('refuses a short AUTH_SECRET', () => {
    process.env.AUTH_SECRET = 'too-short';
    expect(() => getEnv()).toThrow(/AUTH_SECRET.*32/s);
  });

  it('refuses a missing AUTH_SECRET', () => {
    delete process.env.AUTH_SECRET;
    expect(() => getEnv()).toThrow(/AUTH_SECRET/);
  });

  it('points the reader at the fix', () => {
    delete process.env.DATABASE_URL;
    expect(() => getEnv()).toThrow(/\.env\.example/);
  });

  it('defaults the optional settings', () => {
    delete process.env.SESSION_ABSOLUTE_DAYS;
    delete process.env.SESSION_IDLE_HOURS;
    delete process.env.TRUST_PROXY_HEADERS;

    const env = getEnv();
    expect(env.SESSION_ABSOLUTE_DAYS).toBe(30);
    expect(env.SESSION_IDLE_HOURS).toBe(72);
    expect(env.TRUST_PROXY_HEADERS).toBe(false);
  });

  it('does not trust proxy headers unless explicitly enabled', () => {
    process.env.TRUST_PROXY_HEADERS = 'yes';
    // Anything other than the literal "true" is rejected rather than coerced,
    // so a typo cannot silently enable header spoofing.
    expect(() => getEnv()).toThrow(/TRUST_PROXY_HEADERS/);
  });

  it('memoises after a successful parse', () => {
    expect(getEnv()).toBe(getEnv());
  });
});

describe('connection string validation', () => {
  it.each([
    ['localhost:5432', 'no scheme, so "localhost" is read as one'],
    ['not a url at all', 'not a URL'],
    ['mysql://user:pass@localhost:3306/db', 'wrong database'],
    ['postgres://', 'no host'],
    ['', 'empty'],
  ])('refuses %s (%s)', (value) => {
    process.env.DATABASE_URL = value;
    expect(() => getEnv()).toThrow(/DATABASE_URL/);
  });

  it.each([
    'postgres://nestedflow:nestedflow@localhost:5432/nestedflow',
    'postgresql://nestedflow:nestedflow@db.internal:5432/nestedflow?sslmode=require',
  ])('accepts %s', (value) => {
    process.env.DATABASE_URL = value;
    expect(() => getEnv()).not.toThrow();
  });

  it('refuses an APP_URL that is not an http origin', () => {
    process.env.APP_URL = 'javascript:alert(1)';
    expect(() => getEnv()).toThrow(/APP_URL/);
  });
});
