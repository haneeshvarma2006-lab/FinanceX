import { afterEach, describe, expect, it } from 'vitest';
import { resetEnvCache } from '@/lib/env';
import { handwritingEnabled, readHandwriting } from './handwriting';

/**
 * The parts of recognition that never reach the network: it is off without a
 * key, and malformed input is refused before any paid call or rate-limit hit.
 */

const original = process.env.ANTHROPIC_API_KEY;

afterEach(() => {
  if (original === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = original;
  resetEnvCache();
});

describe('reading handwriting', () => {
  it('is off, and says so, without an API key', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    resetEnvCache();
    expect(handwritingEnabled()).toBe(false);
    const result = await readHandwriting('user', ['iVBORw0KGgoAAAA']);
    expect(result).toMatchObject({ ok: false, reason: 'not-configured' });
  });

  it('refuses input that is not a small set of PNGs before calling anything', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key-never-used';
    resetEnvCache();
    expect(handwritingEnabled()).toBe(true);
    for (const slices of [
      [],
      ['not-a-png'],
      Array(7).fill('iVBORw0KGgoAAAA'),
      ['iVBORw0KGgo' + 'A'.repeat(3_600_000)],
    ]) {
      expect(await readHandwriting('user', slices)).toMatchObject({ ok: false, reason: 'invalid' });
    }
  });
});
