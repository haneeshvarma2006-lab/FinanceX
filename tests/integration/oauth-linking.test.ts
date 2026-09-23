import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getPool } from '@/lib/db/client';
import * as identity from '@/modules/identity/service';
import * as repo from '@/modules/identity/repository';
import { signUpSchema } from '@/modules/identity/validators';
import { resolveGoogleIdentity } from '@/modules/identity/linking';
import type { GoogleIdentity } from '@/modules/identity/oauth';

/**
 * Regression tests for two vulnerabilities found by security review.
 *
 * Both were real and both are fixed; these exist so they cannot come back
 * quietly.
 */

const ctx = { ip: '203.0.113.70', userAgent: 'vitest' };

async function reset() {
  await getPool().query('truncate table users cascade');
  await getPool().query('truncate table rate_limits, oauth_states, pending_registrations');
}

function googleIdentity(overrides: Partial<GoogleIdentity> = {}): GoogleIdentity {
  return {
    subject: 'google-subject-12345',
    email: 'victim@example.com',
    emailVerified: true,
    name: 'Victim',
    picture: null,
    ...overrides,
  };
}

async function makeLocalUser(email: string) {
  const result = await identity.signUp(
    signUpSchema.parse({
      email,
      password: 'a sufficiently long passphrase',
      displayName: 'Local',
      dateOfBirth: '1990-01-01',
      acceptedTerms: true,
    }),
    ctx,
  );
  if (!result.ok) throw new Error('setup failed');
  return result.user;
}

beforeEach(reset);
afterAll(async () => {
  await reset();
  await getPool().end();
});

describe('pre-account-linking takeover', () => {
  /**
   * THE ATTACK: an attacker registers locally with the victim's email address.
   * Nothing proves they own it — this build cannot send verification mail at
   * all. The victim later clicks "Continue with Google"; Google correctly
   * asserts the address is theirs. If auto-linking checked only the provider
   * side, the victim's Google identity would be attached to the attacker's
   * account and the victim would be signed into it, handing the attacker
   * everything the victim subsequently records.
   */
  it('refuses to auto-link to a local account that never proved its address', async () => {
    const attacker = await makeLocalUser('victim@example.com');
    expect(attacker.emailVerifiedAt).toBeNull();

    const outcome = await resolveGoogleIdentity(googleIdentity());

    expect(outcome.kind).toBe('refused');
    if (outcome.kind !== 'refused') return;
    expect(outcome.reason).toBe('local_account_unverified');

    // Critically: no link was created, so the attacker gained nothing.
    expect(await repo.listOAuthAccountsForUser(attacker.id)).toEqual([]);
  });

  it('does not mark the unverified account as verified as a side effect', async () => {
    const attacker = await makeLocalUser('victim@example.com');
    await resolveGoogleIdentity(googleIdentity());

    const after = await repo.findUserById(attacker.id);
    // The old code set this while linking, laundering an unproven address into
    // a verified one.
    expect(after?.emailVerifiedAt).toBeNull();
  });

  it('DOES auto-link when the local account is genuinely verified', async () => {
    const user = await makeLocalUser('verified@example.com');
    await repo.setUserVerifiedEmail(user.id, new Date());

    const outcome = await resolveGoogleIdentity(googleIdentity({ email: 'verified@example.com' }));

    expect(outcome.kind).toBe('linked_to_local');
    expect(await repo.listOAuthAccountsForUser(user.id)).toHaveLength(1);
  });

  it('still refuses when Google has not verified its own side', async () => {
    const user = await makeLocalUser('verified@example.com');
    await repo.setUserVerifiedEmail(user.id, new Date());

    const outcome = await resolveGoogleIdentity(
      googleIdentity({ email: 'verified@example.com', emailVerified: false }),
    );

    expect(outcome.kind).toBe('refused');
    if (outcome.kind !== 'refused') return;
    expect(outcome.reason).toBe('email_unverified');
  });

  it('resolves an already-linked subject even if the provider email changed', async () => {
    const user = await makeLocalUser('original@example.com');
    await repo.insertOAuthAccount({
      userId: user.id,
      provider: 'google',
      subject: 'google-subject-12345',
      providerEmail: 'original@example.com',
    });

    // Matching on the stable subject, not the mutable address.
    const outcome = await resolveGoogleIdentity(googleIdentity({ email: 'changed@example.com' }));

    expect(outcome.kind).toBe('existing_link');
    if (outcome.kind !== 'existing_link') return;
    expect(outcome.user.id).toBe(user.id);
  });

  it('refuses to link a subject already attached to a different account', async () => {
    const owner = await makeLocalUser('owner@example.com');
    const other = await makeLocalUser('other@example.com');

    await repo.insertOAuthAccount({
      userId: owner.id,
      provider: 'google',
      subject: 'google-subject-12345',
      providerEmail: 'owner@example.com',
    });

    const outcome = await resolveGoogleIdentity(googleIdentity(), other);

    expect(outcome.kind).toBe('refused');
    if (outcome.kind !== 'refused') return;
    expect(outcome.reason).toBe('already_linked_elsewhere');
  });
});

describe('pending registration', () => {
  /**
   * The old code parked a pending identity in `oauth_states` with a CONSTANT
   * code verifier and a state hash derived from the provider subject — both
   * computable offline by anyone who knew their own Google subject. It now
   * lives in its own table under a random token, held only in an httpOnly
   * cookie.
   */
  it('is keyed by an unguessable token, stored hashed', async () => {
    const { randomBytes, createHash } = await import('node:crypto');
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');

    await repo.insertPendingRegistration({
      tokenHash,
      provider: 'google',
      subject: 'sub-1',
      email: 'new@example.com',
      displayName: 'New Person',
      avatarUrl: null,
      redirectTo: null,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const { rows } = await getPool().query<{ token_hash: string }>(
      'select token_hash from pending_registrations',
    );
    expect(rows[0]?.token_hash).toBe(tokenHash);
    expect(rows[0]?.token_hash).not.toBe(token);

    // A subject-derived guess finds nothing.
    const guessed = createHash('sha256').update('pending:sub-1').digest('hex');
    expect(await repo.findPendingRegistration(guessed, new Date())).toBeUndefined();
  });

  it('applies the age gate to the OAuth path too', async () => {
    const { randomBytes, createHash } = await import('node:crypto');
    const token = randomBytes(32).toString('base64url');

    await repo.insertPendingRegistration({
      tokenHash: createHash('sha256').update(token).digest('hex'),
      provider: 'google',
      subject: 'sub-child',
      email: 'child@example.com',
      displayName: 'Child',
      avatarUrl: null,
      redirectTo: null,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const result = await identity.completeOAuthSignUp(
      token,
      {
        displayName: 'Child',
        dateOfBirth: '2015-01-01',
        acceptedTerms: true,
        marketingOptIn: false,
      },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('age_restricted');

    // Signing in with Google must not be a way around the age gate.
    const { rows } = await getPool().query('select id from users where email = $1', [
      'child@example.com',
    ]);
    expect(rows).toHaveLength(0);
  });

  it('creates a verified account and consumes the pending row', async () => {
    const { randomBytes, createHash } = await import('node:crypto');
    const token = randomBytes(32).toString('base64url');

    await repo.insertPendingRegistration({
      tokenHash: createHash('sha256').update(token).digest('hex'),
      provider: 'google',
      subject: 'sub-adult',
      email: 'adult@example.com',
      displayName: 'Adult',
      avatarUrl: null,
      redirectTo: null,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const result = await identity.completeOAuthSignUp(
      token,
      {
        displayName: 'Adult',
        dateOfBirth: '1990-01-01',
        acceptedTerms: true,
        marketingOptIn: false,
      },
      ctx,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.user.email).toBe('adult@example.com');
    expect(result.user.emailVerifiedAt).not.toBeNull();
    expect(await repo.listOAuthAccountsForUser(result.user.id)).toHaveLength(1);

    // Single use: the row is gone, so the identity cannot register twice.
    const replay = await identity.completeOAuthSignUp(
      token,
      {
        displayName: 'Adult',
        dateOfBirth: '1990-01-01',
        acceptedTerms: true,
        marketingOptIn: false,
      },
      ctx,
    );
    expect(replay.ok).toBe(false);
  });

  it('cannot register an address a pending row does not name', async () => {
    // There is no email field in the completion schema at all — the address
    // comes from the server-side row, so a crafted POST has nothing to change.
    const { completeOAuthSignUpSchema } = await import('@/modules/identity/validators');
    const parsed = completeOAuthSignUpSchema.parse({
      displayName: 'Someone',
      dateOfBirth: '1990-01-01',
      acceptedTerms: true,
      // Deliberately smuggling an extra field; Zod strips it.
      email: 'attacker@example.com',
    });

    expect('email' in parsed).toBe(false);
  });
});

describe('oauth handshake state', () => {
  it('is single use', async () => {
    const { hashState } = await import('@/modules/identity/oauth');

    await repo.insertOAuthState({
      stateHash: hashState('state-value'),
      codeVerifier: 'verifier',
      nonce: 'nonce',
      redirectTo: null,
      linkToUserId: null,
      expiresAt: new Date(Date.now() + 60_000),
    });

    expect(await repo.consumeOAuthState(hashState('state-value'), new Date())).toBeDefined();
    // A replayed callback finds nothing.
    expect(await repo.consumeOAuthState(hashState('state-value'), new Date())).toBeUndefined();
  });

  it('expires', async () => {
    const { hashState } = await import('@/modules/identity/oauth');

    await repo.insertOAuthState({
      stateHash: hashState('old-state'),
      codeVerifier: 'verifier',
      nonce: 'nonce',
      redirectTo: null,
      linkToUserId: null,
      expiresAt: new Date(Date.now() - 1000),
    });

    expect(await repo.consumeOAuthState(hashState('old-state'), new Date())).toBeUndefined();
  });

  it('never stores the raw state value', async () => {
    const { hashState } = await import('@/modules/identity/oauth');

    await repo.insertOAuthState({
      stateHash: hashState('secret-state'),
      codeVerifier: 'verifier',
      nonce: 'nonce',
      redirectTo: null,
      linkToUserId: null,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const { rows } = await getPool().query<{ state_hash: string }>(
      'select state_hash from oauth_states',
    );
    expect(rows[0]?.state_hash).not.toBe('secret-state');
    expect(rows[0]?.state_hash).toHaveLength(64);
  });
});
