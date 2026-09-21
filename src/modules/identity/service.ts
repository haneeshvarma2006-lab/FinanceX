import { randomBytes } from 'node:crypto';
import { addDays, addHours } from 'date-fns';
import { getEnv } from '@/lib/env';
import { consume, networkScope, reset, RULES } from '@/lib/security/rate-limit';
import { hashPassword, verifyPassword } from '@/lib/security/password';
import { generateSessionToken, hashToken } from '@/lib/security/tokens';
import { seedEmailPreferences } from './onboarding';
import { checkAge, ageRejectionMessage } from './age';
import { CURRENT_DOCUMENT_VERSIONS } from './consent';
import * as repo from './repository';
import type { User } from './schema';
import type { CompleteOAuthSignUpInput, SignInInput, SignUpInput } from './validators';

export type RequestContext = {
  ip: string | null;
  userAgent: string | null;
  /** 'web' | 'mobile' | 'api'. Defaults to web; see sessions.client. */
  client?: string;
};

export type AuthFailure =
  | { kind: 'invalid_credentials' }
  | { kind: 'email_taken' }
  | { kind: 'rate_limited'; retryAfterSeconds: number }
  | { kind: 'age_restricted'; message: string };

export type AuthResult =
  { ok: true; user: User; token: string; expiresAt: Date } | { ok: false; error: AuthFailure };

function sessionDeadlines(now: Date): { expiresAt: Date; idleExpiresAt: Date } {
  const env = getEnv();
  return {
    expiresAt: addDays(now, env.SESSION_ABSOLUTE_DAYS),
    idleExpiresAt: addHours(now, env.SESSION_IDLE_HOURS),
  };
}

/** Exposed for the OAuth callback, which issues a session without a password. */
export async function startSessionForUser(
  user: User,
  ctx: RequestContext,
  now: Date = new Date(),
): Promise<{ token: string; expiresAt: Date }> {
  return startSession(user, ctx, now);
}

async function startSession(user: User, ctx: RequestContext, now: Date) {
  const token = generateSessionToken();
  const { expiresAt, idleExpiresAt } = sessionDeadlines(now);

  await repo.insertSession({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt,
    idleExpiresAt,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    client: ctx.client ?? 'web',
  });

  return { token, expiresAt };
}

export async function signUp(
  input: SignUpInput,
  ctx: RequestContext,
  now: Date = new Date(),
): Promise<AuthResult> {
  const network = networkScope('signup', ctx.ip);
  const ipGate = await consume(network.key, network.rule, now);
  if (!ipGate.allowed) {
    await repo.insertAuditEntry({
      action: 'auth.signup.rate_limited',
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return {
      ok: false,
      error: { kind: 'rate_limited', retryAfterSeconds: ipGate.retryAfterSeconds },
    };
  }

  /**
   * The age gate runs on the server before anything is created. A gate that
   * only exists in the form is bypassed by posting the request directly.
   */
  const age = checkAge(input.dateOfBirth, now);
  if (!age.eligible) {
    await repo.insertAuditEntry({
      action: 'auth.signup.age_restricted',
      metadata: { reason: age.reason },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return {
      ok: false,
      error: { kind: 'age_restricted', message: ageRejectionMessage(age.reason) },
    };
  }

  const existing = await repo.findUserByEmail(input.email);
  if (existing) {
    await repo.insertAuditEntry({
      action: 'auth.signup.email_taken',
      metadata: { email: input.email },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return { ok: false, error: { kind: 'email_taken' } };
  }

  const user = await repo.insertUser({
    email: input.email,
    passwordHash: await hashPassword(input.password),
    displayName: input.displayName,
    dateOfBirth: input.dateOfBirth,
    ageVerifiedAt: now,
    timezone: input.timezone,
    baseCurrency: input.baseCurrency,
  });

  // Record what was agreed to, and which version of it.
  await repo.insertConsent({
    userId: user.id,
    kind: 'terms_and_privacy',
    documentVersion: CURRENT_DOCUMENT_VERSIONS.terms_and_privacy,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });

  if (input.marketingOptIn) {
    await repo.insertConsent({
      userId: user.id,
      kind: 'marketing_email',
      documentVersion: CURRENT_DOCUMENT_VERSIONS.marketing_email,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  }

  await seedEmailPreferences(user.id, input.marketingOptIn);

  const { token, expiresAt } = await startSession(user, ctx, now);

  await repo.insertAuditEntry({
    userId: user.id,
    action: 'auth.signup.success',
    entityType: 'user',
    entityId: user.id,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });

  return { ok: true, user, token, expiresAt };
}

export async function signIn(
  input: SignInInput,
  ctx: RequestContext,
  now: Date = new Date(),
): Promise<AuthResult> {
  const network = networkScope('signin', ctx.ip);
  const accountKey = `signin:account:${input.email}`;

  const [ipGate, accountGate] = await Promise.all([
    consume(network.key, network.rule, now),
    consume(accountKey, RULES.signInPerAccount, now),
  ]);

  if (!ipGate.allowed || !accountGate.allowed) {
    await repo.insertAuditEntry({
      action: 'auth.signin.rate_limited',
      metadata: { email: input.email, scope: !ipGate.allowed ? 'network' : 'account' },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return {
      ok: false,
      error: {
        kind: 'rate_limited',
        retryAfterSeconds: Math.max(ipGate.retryAfterSeconds, accountGate.retryAfterSeconds),
      },
    };
  }

  const user = await repo.findUserByEmail(input.email);

  /**
   * When the account does not exist we still run a verification against a
   * throwaway digest. Otherwise "unknown address" returns in a millisecond
   * while "wrong password" takes the full argon2 cost, and that timing gap is
   * a working account-enumeration oracle.
   */
  const digest = user?.passwordHash ?? (await getDummyDigest());
  const passwordMatches = await verifyPassword(digest, input.password);

  if (!user || !passwordMatches) {
    await repo.insertAuditEntry({
      userId: user?.id ?? null,
      action: 'auth.signin.failed',
      metadata: { email: input.email, reason: user ? 'bad_password' : 'unknown_email' },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    // One message for both cases, so the response does not reveal which it was.
    return { ok: false, error: { kind: 'invalid_credentials' } };
  }

  const { token, expiresAt } = await startSession(user, ctx, now);
  await reset(accountKey);

  await repo.insertAuditEntry({
    userId: user.id,
    action: 'auth.signin.success',
    entityType: 'user',
    entityId: user.id,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });

  return { ok: true, user, token, expiresAt };
}

export async function signOut(token: string, ctx: RequestContext): Promise<void> {
  const tokenHash = hashToken(token);
  const live = await repo.findLiveSession(tokenHash, new Date());

  await repo.deleteSessionByTokenHash(tokenHash);

  await repo.insertAuditEntry({
    userId: live?.user.id ?? null,
    action: 'auth.signout',
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
}

/**
 * Resolve a session token to its user, rolling the idle deadline forward.
 *
 * The roll is throttled: rewriting the row on every single request turns a
 * read into a write on the hottest path in the application for no benefit.
 */
export async function resolveSession(
  token: string,
  now: Date = new Date(),
): Promise<User | undefined> {
  const live = await repo.findLiveSession(hashToken(token), now);
  if (!live) return undefined;

  const env = getEnv();
  const nextIdle = addHours(now, env.SESSION_IDLE_HOURS);
  const remainingMs = live.session.idleExpiresAt.getTime() - now.getTime();
  const windowMs = env.SESSION_IDLE_HOURS * 3600 * 1000;

  if (remainingMs < windowMs * 0.9) {
    await repo.touchSession(live.session.id, nextIdle);
  }

  return live.user;
}

/**
 * A genuine argon2id digest of a random value nobody can supply, used purely to
 * keep the unknown-account path's timing indistinguishable from the
 * wrong-password path's.
 *
 * It is computed rather than hard-coded on purpose: a literal that argon2
 * cannot parse would make verification fail instantly, which is precisely the
 * timing signal this is here to remove.
 */
let dummyDigestPromise: Promise<string> | undefined;

function getDummyDigest(): Promise<string> {
  dummyDigestPromise ??= hashPassword(randomBytes(32).toString('base64url'));
  return dummyDigestPromise;
}

export type OAuthSignUpFailure =
  { kind: 'expired' } | { kind: 'email_taken' } | { kind: 'age_restricted'; message: string };

export type OAuthSignUpResult =
  | { ok: true; user: User; token: string; expiresAt: Date }
  | { ok: false; error: OAuthSignUpFailure };

/**
 * Create an account from a verified pending OAuth identity.
 *
 * The provider identity is read from the server-side row, not from the caller,
 * so the only thing the user supplies here is their name, date of birth and
 * consent. The age gate applies exactly as it does to a password sign-up — the
 * OAuth path is not a way around it.
 */
export async function completeOAuthSignUp(
  pendingToken: string,
  input: CompleteOAuthSignUpInput,
  ctx: RequestContext,
  now: Date = new Date(),
): Promise<OAuthSignUpResult> {
  const pending = await repo.findPendingRegistration(hashToken(pendingToken), now);
  if (!pending) return { ok: false, error: { kind: 'expired' } };

  const age = checkAge(input.dateOfBirth, now);
  if (!age.eligible) {
    await repo.insertAuditEntry({
      action: 'auth.signup.age_restricted',
      metadata: { reason: age.reason, provider: pending.provider },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return {
      ok: false,
      error: { kind: 'age_restricted', message: ageRejectionMessage(age.reason) },
    };
  }

  // Raced with a local sign-up on the same address in the meantime.
  if (await repo.findUserByEmail(pending.email)) {
    return { ok: false, error: { kind: 'email_taken' } };
  }

  // Consumed here, so the same verified identity cannot register twice.
  const consumed = await repo.consumePendingRegistration(hashToken(pendingToken), now);
  if (!consumed) return { ok: false, error: { kind: 'expired' } };

  const user = await repo.insertOAuthUser({
    email: consumed.email,
    displayName: input.displayName,
    avatarUrl: consumed.avatarUrl,
    dateOfBirth: input.dateOfBirth,
    timezone: 'Asia/Kolkata',
    baseCurrency: 'INR',
    // The provider asserted this address, and the callback only reaches this
    // point when it did so as verified.
    emailVerified: true,
  });

  await repo.insertOAuthAccount({
    userId: user.id,
    provider: consumed.provider,
    subject: consumed.subject,
    providerEmail: consumed.email,
  });

  await repo.insertConsent({
    userId: user.id,
    kind: 'terms_and_privacy',
    documentVersion: CURRENT_DOCUMENT_VERSIONS.terms_and_privacy,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });

  if (input.marketingOptIn) {
    await repo.insertConsent({
      userId: user.id,
      kind: 'marketing_email',
      documentVersion: CURRENT_DOCUMENT_VERSIONS.marketing_email,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  }

  await seedEmailPreferences(user.id, input.marketingOptIn);

  const { token, expiresAt } = await startSession(user, ctx, now);

  await repo.insertAuditEntry({
    userId: user.id,
    action: 'auth.signup.oauth_success',
    entityType: 'user',
    entityId: user.id,
    metadata: { provider: consumed.provider },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });

  return { ok: true, user, token, expiresAt };
}
