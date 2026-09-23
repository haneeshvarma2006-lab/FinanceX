import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `next build` imports every route module to read its exported configuration.
 * Anything a route's import graph constructs at module scope therefore has to
 * succeed during the build — with no database and no secrets.
 *
 * This is not hypothetical. The database pool used to be built at module
 * scope, which made `getEnv()` run at import time, which made the production
 * build fail on a Vercel project before a single request was served:
 *
 *     Failed to collect configuration for /api/auth/google/callback
 *       [cause]: Invalid environment configuration.
 *         - DATABASE_URL: expected string, received undefined
 *
 * Reverting the pool to eager construction makes this file fail.
 */
describe('invariant: the build needs no runtime secrets', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    for (const key of ['DATABASE_URL', 'AUTH_SECRET', 'APP_URL', 'TRUST_PROXY_HEADERS']) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    process.env = { ...saved };
    vi.resetModules();
  });

  it('imports the database client without a DATABASE_URL', async () => {
    await expect(import('@/lib/db/client')).resolves.toHaveProperty('db');
  });

  it('imports the modules a route pulls in, without secrets', async () => {
    // The exact chain that broke the deployment: the OAuth callback imports
    // the identity repository, which imports the database client.
    await expect(import('@/modules/identity/repository')).resolves.toBeDefined();
    await expect(import('@/modules/identity/oauth')).resolves.toBeDefined();
  });

  it('still fails loudly the moment the database is actually used', async () => {
    const { getPool } = await import('@/lib/db/client');
    // Deferred, not skipped: the contract is that a missing DATABASE_URL is a
    // startup error at first use, never a silent fallback to some default.
    expect(() => getPool()).toThrow(/DATABASE_URL/);
  });
});
