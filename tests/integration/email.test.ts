import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { subHours } from 'date-fns';
import { pool } from '@/lib/db/client';
import * as identity from '@/modules/identity/service';
import { signUpSchema } from '@/modules/identity/validators';
import * as email from '@/modules/email/service';
import * as emailRepo from '@/modules/email/repository';
import { EMAIL_CATEGORY_KEYS, OPTIONAL_CATEGORIES } from '@/modules/email/categories';

const ctx = { ip: '203.0.113.30', userAgent: 'vitest' };

async function reset() {
  await pool.query(
    'truncate table email_log, email_tokens, email_preferences, email_suppressions, audit_log, sessions, rate_limits, users cascade',
  );
}

async function makeUser(address = 'mailer@example.com') {
  const result = await identity.signUp(
    signUpSchema.parse({
      email: address,
      password: 'a sufficiently long passphrase',
      dateOfBirth: '1995-04-12',
      acceptedTerms: true,
      displayName: 'Mailer',
    }),
    ctx,
  );
  if (!result.ok) throw new Error('setup failed');
  await emailRepo.seedPreferences(result.user.id);
  return result.user;
}

beforeEach(async () => {
  await reset();
  email.setTransport(undefined);
});

afterAll(async () => {
  await reset();
  await pool.end();
});

function recorder() {
  const sent: { to: string; subject: string; headers: Record<string, string> }[] = [];
  email.setTransport(async (message, headers) => {
    sent.push({ to: message.to, subject: message.subject, headers });
  });
  return sent;
}

describe('preference defaults', () => {
  it('seeds every category', async () => {
    const user = await makeUser();
    const prefs = await emailRepo.listPreferences(user.id);
    expect(prefs.map((p) => p.category).sort()).toEqual([...EMAIL_CATEGORY_KEYS].sort());
  });

  it('defaults marketing to off and transactional to on', async () => {
    const user = await makeUser();
    const prefs = await emailRepo.listPreferences(user.id);
    const by = Object.fromEntries(prefs.map((p) => [p.category, p.subscribed]));

    // Opt-out marketing would mean relying on consent never given.
    expect(by.marketing).toBe(false);
    expect(by.product_updates).toBe(false);
    expect(by.essential).toBe(true);
    expect(by.security).toBe(true);
  });

  it('is idempotent, so a retried signup cannot duplicate rows', async () => {
    const user = await makeUser();
    await emailRepo.seedPreferences(user.id);
    await emailRepo.seedPreferences(user.id);

    expect(await emailRepo.listPreferences(user.id)).toHaveLength(EMAIL_CATEGORY_KEYS.length);
  });
});

describe('send gating', () => {
  it('sends essential mail', async () => {
    const sent = recorder();
    const user = await makeUser();

    const outcome = await email.send(
      { userId: user.id, email: user.email, emailVerifiedAt: null },
      { subject: 'Confirm your email', text: 'link', category: 'essential' },
    );

    expect(outcome).toEqual({ sent: true });
    expect(sent).toHaveLength(1);
  });

  it('refuses marketing that was never opted into', async () => {
    const sent = recorder();
    const user = await makeUser();

    const outcome = await email.send(
      { userId: user.id, email: user.email, emailVerifiedAt: new Date() },
      { subject: 'Offers', text: 'buy', category: 'marketing' },
    );

    expect(outcome).toEqual({ sent: false, reason: 'unsubscribed' });
    expect(sent).toHaveLength(0);
  });

  it('refuses marketing to an unverified address even when opted in', async () => {
    const sent = recorder();
    const user = await makeUser();
    await emailRepo.setPreference(user.id, 'marketing', true);

    const outcome = await email.send(
      { userId: user.id, email: user.email, emailVerifiedAt: null },
      { subject: 'Offers', text: 'buy', category: 'marketing' },
    );

    expect(outcome).toEqual({ sent: false, reason: 'unverified' });
    expect(sent).toHaveLength(0);
  });

  it('sends marketing once opted in and verified', async () => {
    const sent = recorder();
    const user = await makeUser();
    await emailRepo.setPreference(user.id, 'marketing', true);

    const outcome = await email.send(
      { userId: user.id, email: user.email, emailVerifiedAt: new Date() },
      { subject: 'Offers', text: 'buy', category: 'marketing' },
    );

    expect(outcome).toEqual({ sent: true });
    expect(sent).toHaveLength(1);
  });

  it('suppresses every category once an address is suppressed', async () => {
    const sent = recorder();
    const user = await makeUser();
    await emailRepo.suppress(user.email, 'hard_bounce');

    for (const category of EMAIL_CATEGORY_KEYS) {
      const outcome = await email.send(
        { userId: user.id, email: user.email, emailVerifiedAt: new Date() },
        { subject: 'Anything', text: 'x', category },
      );
      expect(outcome, `${category} must be suppressed`).toEqual({
        sent: false,
        reason: 'suppressed',
      });
    }

    expect(sent).toHaveLength(0);
  });

  it('suppresses case-insensitively', async () => {
    const user = await makeUser('Mixed.Case@Example.com');
    await emailRepo.suppress('MIXED.CASE@EXAMPLE.COM', 'complaint');
    expect(await emailRepo.isSuppressed(user.email)).toBe(true);
  });

  it('records a skip with its reason', async () => {
    const user = await makeUser();
    await email.send(
      { userId: user.id, email: user.email, emailVerifiedAt: new Date() },
      { subject: 'Offers', text: 'buy', category: 'marketing' },
    );

    const log = await emailRepo.listLogForUser(user.id);
    expect(log).toHaveLength(1);
    expect(log[0]?.status).toBe('skipped');
    expect(log[0]?.skipReason).toBe('unsubscribed');
  });

  it('never stores the message body', async () => {
    const user = await makeUser();
    recorder();
    await email.send(
      { userId: user.id, email: user.email, emailVerifiedAt: null },
      { subject: 'Confirm', text: 'SECRET-BODY-CONTENT', category: 'essential' },
    );

    const { rows } = await pool.query<{ c: string }>(
      `select count(*)::text as c from email_log where subject like '%SECRET-BODY%'`,
    );
    expect(rows[0]?.c).toBe('0');
  });
});

describe('unsubscribe headers', () => {
  it('adds List-Unsubscribe with one-click to optional categories', async () => {
    const sent = recorder();
    const user = await makeUser();
    await emailRepo.setPreference(user.id, 'marketing', true);

    await email.send(
      { userId: user.id, email: user.email, emailVerifiedAt: new Date() },
      { subject: 'Offers', text: 'buy', category: 'marketing' },
    );

    expect(sent[0]?.headers['List-Unsubscribe']).toMatch(/^<https?:\/\/.+\/unsubscribe\?token=/);
    expect(sent[0]?.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });

  it('omits the header on essential mail, which has no unsubscribe', async () => {
    const sent = recorder();
    const user = await makeUser();

    await email.send(
      { userId: user.id, email: user.email, emailVerifiedAt: null },
      { subject: 'Confirm your email', text: 'link', category: 'essential' },
    );

    expect(sent[0]?.headers['List-Unsubscribe']).toBeUndefined();
  });
});

describe('unsubscribe tokens', () => {
  it('turns off exactly the category it was issued for', async () => {
    const user = await makeUser();
    for (const c of OPTIONAL_CATEGORIES) await emailRepo.setPreference(user.id, c, true);

    const token = await email.createUnsubscribeToken(user.id, 'product_updates');
    const result = await email.unsubscribeByToken(token);

    expect(result).toEqual({ category: 'product_updates' });

    const prefs = Object.fromEntries(
      (await emailRepo.listPreferences(user.id)).map((p) => [p.category, p.subscribed]),
    );
    expect(prefs.product_updates).toBe(false);
    // The others are untouched.
    expect(prefs.marketing).toBe(true);
    expect(prefs.security).toBe(true);
  });

  it('cannot be replayed', async () => {
    const user = await makeUser();
    const token = await email.createUnsubscribeToken(user.id, 'marketing');

    expect(await email.unsubscribeByToken(token)).toEqual({ category: 'marketing' });
    // Second presentation finds nothing to redeem.
    expect(await email.unsubscribeByToken(token)).toBeUndefined();
  });

  it('survives concurrent redemption without double-processing', async () => {
    const user = await makeUser();
    const token = await email.createUnsubscribeToken(user.id, 'marketing');

    const results = await Promise.all(
      Array.from({ length: 5 }, () => email.unsubscribeByToken(token)),
    );

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('rejects an unknown token', async () => {
    expect(await email.unsubscribeByToken('not-a-real-token')).toBeUndefined();
  });

  it('stores only the hash of a token', async () => {
    const user = await makeUser();
    const token = await email.createUnsubscribeToken(user.id, 'marketing');

    const { rows } = await pool.query<{ token_hash: string }>(
      'select token_hash from email_tokens',
    );
    expect(rows[0]?.token_hash).not.toBe(token);
    expect(rows[0]?.token_hash).toHaveLength(64);
  });
});

describe('verification tokens', () => {
  it('redeems once and identifies the user', async () => {
    const user = await makeUser();
    const token = await email.createVerificationToken(user.id);

    expect(await email.redeemVerificationToken(token)).toEqual({ userId: user.id });
    expect(await email.redeemVerificationToken(token)).toBeUndefined();
  });

  it('refuses an expired token', async () => {
    const user = await makeUser();
    const token = await email.createVerificationToken(user.id);

    await pool.query('update email_tokens set expires_at = $1', [subHours(new Date(), 1)]);

    expect(await email.redeemVerificationToken(token)).toBeUndefined();
  });

  it('will not accept an unsubscribe token as a verification token', async () => {
    const user = await makeUser();
    const token = await email.createUnsubscribeToken(user.id, 'marketing');

    // Token kinds are separate namespaces; confusing them would let an
    // unsubscribe link verify an address.
    expect(await email.redeemVerificationToken(token)).toBeUndefined();
  });
});

describe('preference isolation', () => {
  it('never exposes or alters another account preferences', async () => {
    const alice = await makeUser('alice@example.com');
    const bob = await makeUser('bob@example.com');

    await emailRepo.setPreference(alice.id, 'marketing', true);

    const bobPrefs = Object.fromEntries(
      (await emailRepo.listPreferences(bob.id)).map((p) => [p.category, p.subscribed]),
    );
    expect(bobPrefs.marketing).toBe(false);

    const alicePrefs = await emailRepo.listPreferences(alice.id);
    expect(alicePrefs.every((p) => p.userId === alice.id)).toBe(true);
  });

  it('unsubscribe token for one account cannot affect another', async () => {
    const alice = await makeUser('alice@example.com');
    const bob = await makeUser('bob@example.com');
    await emailRepo.setPreference(bob.id, 'marketing', true);

    const token = await email.createUnsubscribeToken(alice.id, 'marketing');
    await email.unsubscribeByToken(token);

    const bobPrefs = Object.fromEntries(
      (await emailRepo.listPreferences(bob.id)).map((p) => [p.category, p.subscribed]),
    );
    expect(bobPrefs.marketing).toBe(true);
  });
});
