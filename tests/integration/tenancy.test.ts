import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '@/lib/db/client';
import * as identity from '@/modules/identity/service';
import * as repo from '@/modules/identity/repository';
import { signUpSchema } from '@/modules/identity/validators';

/**
 * The isolation gate for M1.
 *
 * D-02 chose multi-user with open registration, which makes a cross-account
 * leak the highest-severity bug this system can have. These tests assert the
 * boundary holds for everything that exists today; each feature module added
 * later extends this file rather than starting its own.
 */

const ctxA = { ip: '203.0.113.10', userAgent: 'alice-agent' };
const ctxB = { ip: '198.51.100.20', userAgent: 'bob-agent' };

async function reset() {
  await pool.query('truncate table audit_log, sessions, rate_limits, users cascade');
}

async function makeUser(email: string, ctx: { ip: string; userAgent: string }) {
  const result = await identity.signUp(
    signUpSchema.parse({
      email,
      password: 'a sufficiently long passphrase',
      displayName: email.split('@')[0]!,
    }),
    ctx,
  );
  if (!result.ok) throw new Error(`could not create ${email}`);
  return result;
}

beforeEach(reset);
afterAll(async () => {
  await reset();
  await pool.end();
});

describe('session isolation', () => {
  it('never resolves one account token to another account', async () => {
    const alice = await makeUser('alice@example.com', ctxA);
    const bob = await makeUser('bob@example.com', ctxB);

    expect(alice.user.id).not.toBe(bob.user.id);

    expect((await identity.resolveSession(alice.token))?.id).toBe(alice.user.id);
    expect((await identity.resolveSession(bob.token))?.id).toBe(bob.user.id);

    // The decisive assertion: neither token can ever surface the other user.
    expect((await identity.resolveSession(alice.token))?.id).not.toBe(bob.user.id);
    expect((await identity.resolveSession(bob.token))?.id).not.toBe(alice.user.id);
  });

  it('leaves the other account signed in when one signs out', async () => {
    const alice = await makeUser('alice@example.com', ctxA);
    const bob = await makeUser('bob@example.com', ctxB);

    await identity.signOut(alice.token, ctxA);

    expect(await identity.resolveSession(alice.token)).toBeUndefined();
    expect((await identity.resolveSession(bob.token))?.id).toBe(bob.user.id);
  });

  it('scopes a bulk session revoke to its own account', async () => {
    const alice = await makeUser('alice@example.com', ctxA);
    const bob = await makeUser('bob@example.com', ctxB);

    await repo.deleteSessionsForUser(alice.user.id);

    expect(await identity.resolveSession(alice.token)).toBeUndefined();
    expect((await identity.resolveSession(bob.token))?.id).toBe(bob.user.id);
  });

  it('does not let a token survive its owner being deleted', async () => {
    const alice = await makeUser('alice@example.com', ctxA);
    const bob = await makeUser('bob@example.com', ctxB);

    await pool.query('delete from users where id = $1', [alice.user.id]);

    // The FK cascades, so no orphaned session is left behind to be replayed.
    expect(await identity.resolveSession(alice.token)).toBeUndefined();
    expect((await identity.resolveSession(bob.token))?.id).toBe(bob.user.id);
  });

  it('hides a soft-deleted account from lookups and its own live session', async () => {
    const alice = await makeUser('alice@example.com', ctxA);

    await pool.query('update users set deleted_at = now() where id = $1', [alice.user.id]);

    expect(await repo.findUserById(alice.user.id)).toBeUndefined();
    expect(await repo.findUserByEmail('alice@example.com')).toBeUndefined();
    expect(await identity.resolveSession(alice.token)).toBeUndefined();
  });
});

describe('rate limit isolation', () => {
  it('does not let one account lock another out', async () => {
    await makeUser('alice@example.com', ctxA);
    await makeUser('bob@example.com', ctxB);
    await pool.query('truncate table rate_limits');

    // Exhaust Alice's per-account budget from a different IP than Bob's.
    for (let i = 0; i < 8; i += 1) {
      await identity.signIn({ email: 'alice@example.com', password: 'wrong' }, ctxA);
    }

    const bob = await identity.signIn(
      { email: 'bob@example.com', password: 'a sufficiently long passphrase' },
      ctxB,
    );

    expect(bob.ok).toBe(true);
  });
});

describe('audit log attribution', () => {
  it('attributes each entry to the account that caused it', async () => {
    const alice = await makeUser('alice@example.com', ctxA);
    const bob = await makeUser('bob@example.com', ctxB);

    const { rows } = await pool.query<{ user_id: string; action: string }>(
      "select user_id, action from audit_log where action = 'auth.signup.success' order by created_at",
    );

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.user_id).sort()).toEqual([alice.user.id, bob.user.id].sort());
  });
});
