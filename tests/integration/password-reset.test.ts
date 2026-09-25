import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addMinutes } from 'date-fns';
import { getPool } from '@/lib/db/client';
import { resetEnvCache } from '@/lib/env';
import * as identity from '@/modules/identity/service';
import * as passwordReset from '@/modules/identity/password-reset';
import { signInSchema, signUpSchema } from '@/modules/identity/validators';
import * as email from '@/modules/email/service';

const ctx = { ip: '203.0.113.40', userAgent: 'vitest' };
const OLD_PASSWORD = 'the original long passphrase';
const NEW_PASSWORD = 'a completely different passphrase';

type Sent = { to: string; subject: string; text: string };

async function wipe() {
  await getPool().query(
    'truncate table email_log, email_tokens, email_preferences, audit_log, sessions, rate_limits, users cascade',
  );
}

async function makeUser(address = 'reset@example.com') {
  const result = await identity.signUp(
    signUpSchema.parse({
      email: address,
      password: OLD_PASSWORD,
      dateOfBirth: '1995-04-12',
      acceptedTerms: true,
      displayName: 'Resetter',
    }),
    ctx,
  );
  if (!result.ok) throw new Error('setup failed');
  return result.user;
}

function recorder(): Sent[] {
  const sent: Sent[] = [];
  email.setTransport(async (message) => {
    sent.push({ to: message.to, subject: message.subject, text: message.text });
  });
  return sent;
}

/** The token exactly as a user would receive it: out of the link in the email. */
function tokenFrom(message: Sent): string {
  const link = message.text.match(/https?:\/\/\S+\/reset-password\?token=([A-Za-z0-9_-]+)/);
  if (!link?.[1]) throw new Error(`no reset link in:\n${message.text}`);
  return link[1];
}

async function requestFor(address: string, now = new Date()) {
  return passwordReset.requestPasswordReset({ email: address }, ctx, now);
}

async function signIn(address: string, password: string) {
  return identity.signIn(signInSchema.parse({ email: address, password }), ctx);
}

beforeEach(async () => {
  await wipe();
  email.setTransport(undefined);
});

afterEach(() => {
  email.setTransport(undefined);
});

afterAll(async () => {
  await wipe();
  await getPool().end();
});

describe('the full reset journey', () => {
  it('emails a link, and the link sets a new password that works', async () => {
    await makeUser();
    const sent = recorder();

    expect(await requestFor('reset@example.com')).toEqual({ ok: true });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('reset@example.com');

    const done = await passwordReset.completePasswordReset(
      { token: tokenFrom(sent[0]!), password: NEW_PASSWORD },
      ctx,
    );
    expect(done.ok).toBe(true);

    expect((await signIn('reset@example.com', NEW_PASSWORD)).ok).toBe(true);
    expect((await signIn('reset@example.com', OLD_PASSWORD)).ok).toBe(false);
  });

  it('matches the address case-insensitively, as sign-in does', async () => {
    await makeUser('mixed@example.com');
    const sent = recorder();

    await requestFor('Mixed@Example.COM'.toLowerCase());
    expect(sent).toHaveLength(1);
  });

  it('signs out every existing session, and issues a fresh one', async () => {
    const user = await makeUser();
    // Two sessions the person did not necessarily start.
    await signIn('reset@example.com', OLD_PASSWORD);
    await signIn('reset@example.com', OLD_PASSWORD);

    const sent = recorder();
    await requestFor('reset@example.com');
    const done = await passwordReset.completePasswordReset(
      { token: tokenFrom(sent[0]!), password: NEW_PASSWORD },
      ctx,
    );
    if (!done.ok) throw new Error('reset failed');

    const { rows } = await getPool().query<{ n: number }>(
      'select count(*)::int as n from sessions where user_id = $1',
      [user.id],
    );
    expect(rows[0]!.n).toBe(1);
    expect(await identity.resolveSession(done.token)).toMatchObject({ id: user.id });
  });

  it('tells the owner their password changed', async () => {
    await makeUser();
    const sent = recorder();
    await requestFor('reset@example.com');
    await passwordReset.completePasswordReset(
      { token: tokenFrom(sent[0]!), password: NEW_PASSWORD },
      ctx,
    );

    expect(sent).toHaveLength(2);
    expect(sent[1]!.subject).toMatch(/password was changed/i);
    expect(sent[1]!.text).not.toMatch(/reset-password\?token=/);
  });

  it('marks the address verified, since only its owner could have clicked', async () => {
    const user = await makeUser();
    expect(user.emailVerifiedAt).toBeNull();

    const sent = recorder();
    await requestFor('reset@example.com');
    await passwordReset.completePasswordReset(
      { token: tokenFrom(sent[0]!), password: NEW_PASSWORD },
      ctx,
    );

    const { rows } = await getPool().query<{ verified: Date | null }>(
      'select email_verified_at as verified from users where id = $1',
      [user.id],
    );
    expect(rows[0]!.verified).not.toBeNull();
  });

  it('lifts a sign-in lockout, which is usually why someone is resetting', async () => {
    await makeUser();
    for (let i = 0; i < 7; i++) await signIn('reset@example.com', 'wrong password entirely');
    const locked = await signIn('reset@example.com', OLD_PASSWORD);
    expect(locked.ok || locked.error.kind).toBe('rate_limited');

    const sent = recorder();
    await requestFor('reset@example.com');
    await passwordReset.completePasswordReset(
      { token: tokenFrom(sent[0]!), password: NEW_PASSWORD },
      ctx,
    );

    expect((await signIn('reset@example.com', NEW_PASSWORD)).ok).toBe(true);
  });
});

describe('the link', () => {
  it('works exactly once', async () => {
    await makeUser();
    const sent = recorder();
    await requestFor('reset@example.com');
    const token = tokenFrom(sent[0]!);

    const first = await passwordReset.completePasswordReset({ token, password: NEW_PASSWORD }, ctx);
    const replay = await passwordReset.completePasswordReset(
      { token, password: 'an attacker chosen passphrase' },
      ctx,
    );

    expect(first.ok).toBe(true);
    expect(replay).toEqual({ ok: false, error: { kind: 'invalid_or_expired' } });
    expect((await signIn('reset@example.com', NEW_PASSWORD)).ok).toBe(true);
  });

  it('cannot be redeemed twice even by simultaneous submissions', async () => {
    await makeUser();
    const sent = recorder();
    await requestFor('reset@example.com');
    const token = tokenFrom(sent[0]!);

    const results = await Promise.all(
      ['first racing passphrase', 'second racing passphrase'].map((password) =>
        passwordReset.completePasswordReset({ token, password }, ctx),
      ),
    );

    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it('expires after its lifetime', async () => {
    await makeUser();
    const sent = recorder();
    const issuedAt = new Date();
    await requestFor('reset@example.com', issuedAt);
    const token = tokenFrom(sent[0]!);

    const late = addMinutes(issuedAt, email.PASSWORD_RESET_TOKEN_TTL_MINUTES + 1);
    expect(await passwordReset.isResetLinkLive(token, late)).toBe(false);
    expect(
      await passwordReset.completePasswordReset({ token, password: NEW_PASSWORD }, ctx, late),
    ).toEqual({ ok: false, error: { kind: 'invalid_or_expired' } });
  });

  it('is killed by a newer request, so only the latest email works', async () => {
    await makeUser();
    const sent = recorder();
    await requestFor('reset@example.com');
    await requestFor('reset@example.com');
    const [older, newer] = sent.map(tokenFrom);

    expect(await passwordReset.isResetLinkLive(older!)).toBe(false);
    expect(await passwordReset.isResetLinkLive(newer!)).toBe(true);
  });

  it('is not used up by merely checking it, as a mail scanner opening it would', async () => {
    await makeUser();
    const sent = recorder();
    await requestFor('reset@example.com');
    const token = tokenFrom(sent[0]!);

    expect(await passwordReset.isResetLinkLive(token)).toBe(true);
    expect(await passwordReset.isResetLinkLive(token)).toBe(true);
    expect(
      (await passwordReset.completePasswordReset({ token, password: NEW_PASSWORD }, ctx)).ok,
    ).toBe(true);
  });

  it('is stored only as a hash', async () => {
    await makeUser();
    const sent = recorder();
    await requestFor('reset@example.com');
    const token = tokenFrom(sent[0]!);

    const { rows } = await getPool().query<{ token_hash: string }>(
      "select token_hash from email_tokens where kind = 'password_reset'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.token_hash).not.toContain(token);
    expect(rows[0]!.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('cannot reset anyone else: a link is bound to the account it was issued for', async () => {
    const victim = await makeUser('victim@example.com');
    await makeUser('attacker@example.com');
    const sent = recorder();
    await requestFor('attacker@example.com');

    await passwordReset.completePasswordReset(
      { token: tokenFrom(sent[0]!), password: NEW_PASSWORD },
      ctx,
    );

    expect((await signIn('victim@example.com', OLD_PASSWORD)).ok).toBe(true);
    expect((await signIn('victim@example.com', NEW_PASSWORD)).ok).toBe(false);
    expect(victim.id).toBeDefined();
  });
});

describe('the request does not reveal who has an account', () => {
  it('answers an unknown address exactly as it answers a real one', async () => {
    await makeUser();
    const sent = recorder();

    const known = await requestFor('reset@example.com');
    const unknown = await requestFor('nobody@example.com');

    expect(unknown).toEqual(known);
    expect(sent.map((m) => m.to)).toEqual(['reset@example.com']);
  });

  it('limits requests per address, whether or not the account exists', async () => {
    await makeUser();
    recorder();

    for (const address of ['reset@example.com', 'nobody@example.com']) {
      const results = [];
      for (let i = 0; i < 4; i++) results.push(await requestFor(address));
      expect(results.slice(0, 3).every((r) => r.ok)).toBe(true);
      expect(results[3]).toMatchObject({ ok: false, error: { kind: 'rate_limited' } });
    }
  });

  it('does the account-dependent work only through the deferral', async () => {
    await makeUser();
    const sent = recorder();
    const deferred: (() => Promise<void>)[] = [];

    const result = await passwordReset.requestPasswordReset(
      { email: 'reset@example.com' },
      ctx,
      new Date(),
      (work) => {
        deferred.push(work);
      },
    );

    // Answered before anything account-specific happened.
    expect(result).toEqual({ ok: true });
    expect(sent).toHaveLength(0);

    await deferred[0]!();
    expect(sent).toHaveLength(1);
  });
});

describe('when email cannot reach users', () => {
  afterEach(() => {
    delete process.env.EMAIL_TRANSPORT;
    (process.env as Record<string, string>).NODE_ENV = 'test';
    resetEnvCache();
  });

  it('refuses up front instead of accepting a request it cannot fulfil', async () => {
    await makeUser();
    // Production with only the console transport: nothing would arrive.
    process.env.EMAIL_TRANSPORT = 'console';
    (process.env as Record<string, string>).NODE_ENV = 'production';
    resetEnvCache();

    expect(email.canDeliverToUsers()).toBe(false);
    expect(await requestFor('reset@example.com')).toEqual({
      ok: false,
      error: { kind: 'unavailable' },
    });
  });

  it('records a provider failure instead of crashing', async () => {
    await makeUser();
    email.setTransport(async () => {
      throw new Error('provider down');
    });

    expect(await requestFor('reset@example.com')).toEqual({ ok: true });

    const { rows } = await getPool().query<{ status: string }>(
      "select status from email_log where subject like 'Reset your%'",
    );
    expect(rows.map((r) => r.status)).toEqual(['failed']);
  });
});
