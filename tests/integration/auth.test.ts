import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { addDays, addHours, subDays, subHours } from 'date-fns';
import { getPool } from '@/lib/db/client';
import * as identity from '@/modules/identity/service';
import * as repo from '@/modules/identity/repository';
import { hashToken } from '@/lib/security/tokens';
import { signUpSchema } from '@/modules/identity/validators';

const ctx = { ip: '203.0.113.10', userAgent: 'vitest' };

function signUpInput(overrides: Partial<Record<string, unknown>> = {}) {
  return signUpSchema.parse({
    email: 'alice@example.com',
    password: 'a sufficiently long passphrase',
    displayName: 'Alice',
    dateOfBirth: '1995-04-12',
    acceptedTerms: true,
    ...overrides,
  });
}

async function reset() {
  await getPool().query('truncate table audit_log, sessions, rate_limits, users cascade');
}

beforeEach(reset);
afterAll(async () => {
  await reset();
  await getPool().end();
});

describe('sign up', () => {
  it('creates an account and an active session', async () => {
    const result = await identity.signUp(signUpInput(), ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.user.email).toBe('alice@example.com');
    expect(result.user.baseCurrency).toBe('INR');
    expect(result.token).toHaveLength(43);

    const resolved = await identity.resolveSession(result.token);
    expect(resolved?.id).toBe(result.user.id);
  });

  it('never stores the password in plain text', async () => {
    const password = 'a sufficiently long passphrase';
    const result = await identity.signUp(signUpInput({ password }), ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { rows } = await getPool().query<{ password_hash: string }>(
      'select password_hash from users where id = $1',
      [result.user.id],
    );

    expect(rows[0]?.password_hash).toMatch(/^\$argon2id\$/);
    expect(rows[0]?.password_hash).not.toContain(password);
  });

  it('rejects a duplicate address regardless of case', async () => {
    await identity.signUp(signUpInput(), ctx);
    const second = await identity.signUp(signUpInput({ email: 'ALICE@example.com' }), ctx);

    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.kind).toBe('email_taken');
  });

  it('records the signup in the audit log', async () => {
    const result = await identity.signUp(signUpInput(), ctx);
    expect(result.ok).toBe(true);

    const { rows } = await getPool().query<{ action: string }>(
      "select action from audit_log where action = 'auth.signup.success'",
    );
    expect(rows).toHaveLength(1);
  });
});

describe('sign in', () => {
  const password = 'a sufficiently long passphrase';

  beforeEach(async () => {
    await identity.signUp(signUpInput({ password }), ctx);
    await getPool().query('truncate table rate_limits');
  });

  it('accepts the correct password', async () => {
    const result = await identity.signIn({ email: 'alice@example.com', password }, ctx);
    expect(result.ok).toBe(true);
  });

  it('is case-insensitive on the address', async () => {
    const result = await identity.signIn({ email: 'ALICE@example.com', password }, ctx);
    expect(result.ok).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const result = await identity.signIn(
      { email: 'alice@example.com', password: 'wrong passphrase entirely' },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('invalid_credentials');
  });

  it('gives an identical answer for an unknown address', async () => {
    const unknown = await identity.signIn({ email: 'nobody@example.com', password }, ctx);
    const wrongPassword = await identity.signIn(
      { email: 'alice@example.com', password: 'wrong passphrase entirely' },
      ctx,
    );

    expect(unknown.ok).toBe(false);
    expect(wrongPassword.ok).toBe(false);
    if (unknown.ok || wrongPassword.ok) return;

    // Same discriminant and same shape: the response cannot be used to work out
    // which addresses have accounts.
    expect(unknown.error).toEqual(wrongPassword.error);
  });

  it('spends real hashing time on an unknown address', async () => {
    // The point of the dummy-digest path: if an unknown address returned
    // instantly, the timing difference alone would enumerate accounts.
    const started = performance.now();
    await identity.signIn({ email: 'nobody@example.com', password }, ctx);
    const elapsed = performance.now() - started;

    expect(elapsed).toBeGreaterThan(5);
  });
});

describe('rate limiting', () => {
  const password = 'a sufficiently long passphrase';

  beforeEach(async () => {
    await identity.signUp(signUpInput({ password }), ctx);
    await getPool().query('truncate table rate_limits');
  });

  it('blocks a brute-force run against one account', async () => {
    const attempt = () =>
      identity.signIn({ email: 'alice@example.com', password: 'wrong one here' }, ctx);

    // The per-account rule permits 6 attempts per window.
    for (let i = 0; i < 6; i += 1) {
      const r = await attempt();
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.kind).toBe('invalid_credentials');
    }

    const blocked = await attempt();
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.error.kind).toBe('rate_limited');
  });

  it('still blocks even when the correct password arrives late', async () => {
    for (let i = 0; i < 7; i += 1) {
      await identity.signIn({ email: 'alice@example.com', password: 'wrong one' }, ctx);
    }

    const result = await identity.signIn({ email: 'alice@example.com', password }, ctx);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('rate_limited');
  });

  it('clears the account counter after a success', async () => {
    for (let i = 0; i < 3; i += 1) {
      await identity.signIn({ email: 'alice@example.com', password: 'wrong one' }, ctx);
    }

    expect((await identity.signIn({ email: 'alice@example.com', password }, ctx)).ok).toBe(true);

    const { rows } = await getPool().query(
      "select key from rate_limits where key = 'signin:account:alice@example.com'",
    );
    expect(rows).toHaveLength(0);
  });

  it('counts concurrent attempts without losing any', async () => {
    // A read-then-write counter would let these all observe the same value and
    // slip through together; the counter is a single atomic statement.
    await Promise.all(
      Array.from({ length: 10 }, () =>
        identity.signIn({ email: 'alice@example.com', password: 'wrong one' }, ctx),
      ),
    );

    const { rows } = await getPool().query<{ count: number }>(
      "select count from rate_limits where key = 'signin:account:alice@example.com'",
    );
    expect(rows[0]?.count).toBe(10);
  });
});

describe('sessions', () => {
  it('stores only the hash of the token', async () => {
    const result = await identity.signUp(signUpInput(), ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { rows } = await getPool().query<{ token_hash: string }>(
      'select token_hash from sessions',
    );

    expect(rows[0]?.token_hash).toBe(hashToken(result.token));
    expect(rows[0]?.token_hash).not.toBe(result.token);
  });

  it('refuses a token that was never issued', async () => {
    expect(await identity.resolveSession('not-a-real-token')).toBeUndefined();
  });

  it('refuses a session past its absolute deadline', async () => {
    const result = await identity.signUp(signUpInput(), ctx);
    if (!result.ok) throw new Error('setup failed');

    await getPool().query('update sessions set expires_at = $1', [subHours(new Date(), 1)]);

    expect(await identity.resolveSession(result.token)).toBeUndefined();
  });

  it('refuses a session past its idle deadline even if the absolute one holds', async () => {
    const result = await identity.signUp(signUpInput(), ctx);
    if (!result.ok) throw new Error('setup failed');

    await getPool().query('update sessions set expires_at = $1, idle_expires_at = $2', [
      addDays(new Date(), 30),
      subHours(new Date(), 1),
    ]);

    expect(await identity.resolveSession(result.token)).toBeUndefined();
  });

  it('rolls the idle deadline forward on use', async () => {
    const result = await identity.signUp(signUpInput(), ctx);
    if (!result.ok) throw new Error('setup failed');

    // Push it close to expiry so the throttled refresh actually triggers.
    const nearlyStale = addHours(new Date(), 1);
    await getPool().query('update sessions set idle_expires_at = $1', [nearlyStale]);

    expect(await identity.resolveSession(result.token)).toBeDefined();

    const { rows } = await getPool().query<{ idle_expires_at: Date }>(
      'select idle_expires_at from sessions',
    );
    expect(rows[0]!.idle_expires_at.getTime()).toBeGreaterThan(nearlyStale.getTime());
  });

  it('destroys the session server-side on sign out', async () => {
    const result = await identity.signUp(signUpInput(), ctx);
    if (!result.ok) throw new Error('setup failed');

    await identity.signOut(result.token, ctx);

    // The row is gone, so a captured cookie is worthless afterwards.
    const { rows } = await getPool().query('select id from sessions');
    expect(rows).toHaveLength(0);
    expect(await identity.resolveSession(result.token)).toBeUndefined();
  });

  it('sweeps expired sessions', async () => {
    const result = await identity.signUp(signUpInput(), ctx);
    if (!result.ok) throw new Error('setup failed');

    await getPool().query('update sessions set expires_at = $1', [subDays(new Date(), 1)]);

    expect(await repo.deleteExpiredSessions(new Date())).toBe(1);
  });
});

describe('unattributed traffic', () => {
  /**
   * Regression guard for a real defect found during E2E.
   *
   * With TRUST_PROXY_HEADERS off the client IP is null, so every anonymous
   * caller shares one bucket. Under the strict per-IP rule that made five
   * sign-ups an hour a *global* ceiling — one script could lock the whole
   * product's registration. Unattributed traffic now gets its own, much higher
   * ceiling, which caps abuse without denying service to everyone else.
   */
  const anonymous = { ip: null, userAgent: 'vitest' };

  it('does not let a handful of anonymous sign-ups lock out registration', async () => {
    for (let i = 0; i < 8; i += 1) {
      const result = await identity.signUp(
        signUpInput({ email: `anon-${i}@example.com` }),
        anonymous,
      );
      expect(result.ok, `sign-up ${i + 1} should still be permitted`).toBe(true);
    }
  });

  it('still caps anonymous sign-ups eventually', async () => {
    const { RULES } = await import('@/lib/security/rate-limit');
    const limit = RULES.signUpUnattributed.limit;

    // Drive the counter straight to the ceiling rather than hashing 120 passwords.
    await getPool().query(
      'insert into rate_limits (key, count, window_started_at) values ($1, $2, now())',
      ['signup:unattributed', limit],
    );

    const blocked = await identity.signUp(signUpInput({ email: 'over@example.com' }), anonymous);

    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.error.kind).toBe('rate_limited');
  });

  it('keeps a known IP on the strict per-client budget', async () => {
    const { RULES } = await import('@/lib/security/rate-limit');

    for (let i = 0; i < RULES.signUpPerIp.limit; i += 1) {
      const result = await identity.signUp(signUpInput({ email: `known-${i}@example.com` }), {
        ip: '203.0.113.99',
        userAgent: 'vitest',
      });
      expect(result.ok).toBe(true);
    }

    const blocked = await identity.signUp(signUpInput({ email: 'known-over@example.com' }), {
      ip: '203.0.113.99',
      userAgent: 'vitest',
    });

    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.error.kind).toBe('rate_limited');
  });
});

describe('age gate at signup', () => {
  /**
   * The gate must live on the server. These call the service directly, which
   * is exactly what bypassing the form looks like.
   */
  it('refuses an underage applicant', async () => {
    const result = await identity.signUp(
      signUpInput({ email: 'child@example.com', dateOfBirth: '2015-01-01' }),
      ctx,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('age_restricted');

    // No account was created.
    const { rows } = await getPool().query('select id from users where email = $1', [
      'child@example.com',
    ]);
    expect(rows).toHaveLength(0);
  });

  it('records the refusal without storing the date of birth', async () => {
    await identity.signUp(
      signUpInput({ email: 'child@example.com', dateOfBirth: '2015-01-01' }),
      ctx,
    );

    const { rows } = await getPool().query<{ metadata: { reason: string } }>(
      "select metadata from audit_log where action = 'auth.signup.age_restricted'",
    );
    expect(rows[0]?.metadata.reason).toBe('underage');
    // The rejected date itself is not retained — there is no account to attach
    // it to, and keeping a child's data after refusing them is the opposite of
    // what the refusal is for.
    expect(JSON.stringify(rows[0]?.metadata)).not.toContain('2015-01-01');
  });

  it('accepts an eligible applicant and stores the date', async () => {
    const result = await identity.signUp(
      signUpInput({ email: 'adult@example.com', dateOfBirth: '1990-06-15' }),
      ctx,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.user.dateOfBirth).toBe('1990-06-15');
    expect(result.user.ageVerifiedAt).not.toBeNull();
  });
});

describe('consent at signup', () => {
  it('records terms acceptance with a version', async () => {
    const result = await identity.signUp(signUpInput(), ctx);
    if (!result.ok) throw new Error('setup failed');

    const consents = await repo.listConsents(result.user.id);
    const terms = consents.find((c) => c.kind === 'terms_and_privacy');

    expect(terms).toBeDefined();
    expect(terms?.documentVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(terms?.revokedAt).toBeNull();
  });

  it('does not record marketing consent that was not given', async () => {
    const result = await identity.signUp(signUpInput(), ctx);
    if (!result.ok) throw new Error('setup failed');

    const consents = await repo.listConsents(result.user.id);
    expect(consents.find((c) => c.kind === 'marketing_email')).toBeUndefined();
  });

  it('records marketing consent when explicitly opted in', async () => {
    const result = await identity.signUp(signUpInput({ marketingOptIn: true }), ctx);
    if (!result.ok) throw new Error('setup failed');

    const consents = await repo.listConsents(result.user.id);
    expect(consents.find((c) => c.kind === 'marketing_email')).toBeDefined();
  });

  it('rejects a signup that did not accept the terms', () => {
    // The schema refuses to parse, so the service is never reached.
    expect(() =>
      signUpSchema.parse({
        email: 'noconsent@example.com',
        password: 'a sufficiently long passphrase',
        displayName: 'No Consent',
        dateOfBirth: '1990-01-01',
        acceptedTerms: false,
      }),
    ).toThrow();

    expect(() =>
      signUpSchema.parse({
        email: 'noconsent@example.com',
        password: 'a sufficiently long passphrase',
        displayName: 'No Consent',
        dateOfBirth: '1990-01-01',
      }),
    ).toThrow();
  });
});
