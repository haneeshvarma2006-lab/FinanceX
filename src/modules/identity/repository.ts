import { and, eq, gt, isNull, lt, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import {
  auditLog,
  consents,
  oauthAccounts,
  oauthStates,
  pendingRegistrations,
  rateLimits,
  sessions,
  users,
  type OAuthAccount,
  type PendingRegistration,
  type Session,
  type User,
} from './schema';

/**
 * Every function here either takes a userId and scopes on it, or is part of
 * authentication itself. Nothing outside this file issues SQL for the identity
 * module — see the lint rule in eslint.config.mjs.
 */

/* ------------------------------------------------------------------ users - */

export async function findUserByEmail(email: string): Promise<User | undefined> {
  const [row] = await db
    .select()
    .from(users)
    .where(and(sql`lower(${users.email}) = lower(${email})`, sql`${users.deletedAt} is null`))
    .limit(1);

  return row;
}

export async function findUserById(id: string): Promise<User | undefined> {
  const [row] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), sql`${users.deletedAt} is null`))
    .limit(1);

  return row;
}

export async function insertUser(input: {
  email: string;
  passwordHash: string;
  displayName: string;
  dateOfBirth: string;
  ageVerifiedAt: Date;
  timezone: string;
  baseCurrency: string;
}): Promise<User> {
  const [row] = await db
    .insert(users)
    .values({
      email: input.email.toLowerCase(),
      passwordHash: input.passwordHash,
      displayName: input.displayName,
      dateOfBirth: input.dateOfBirth,
      ageVerifiedAt: input.ageVerifiedAt,
      timezone: input.timezone,
      baseCurrency: input.baseCurrency,
    })
    .returning();

  // The insert either returns a row or throws; this satisfies the type checker
  // without pretending the undefined case is reachable.
  if (!row) throw new Error('User insert returned no row');
  return row;
}

/* --------------------------------------------------------------- sessions - */

export async function insertSession(input: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  idleExpiresAt: Date;
  ip: string | null;
  userAgent: string | null;
  client?: string;
}): Promise<Session> {
  const [row] = await db.insert(sessions).values(input).returning();
  if (!row) throw new Error('Session insert returned no row');
  return row;
}

/**
 * Returns the session and its user in one round trip, and only when the
 * session is live on both the absolute and the idle clock. An expired row is
 * simply not found, so callers cannot accidentally honour it.
 */
export async function findLiveSession(
  tokenHash: string,
  now: Date,
): Promise<{ session: Session; user: User } | undefined> {
  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.tokenHash, tokenHash),
        gt(sessions.expiresAt, now),
        gt(sessions.idleExpiresAt, now),
        sql`${users.deletedAt} is null`,
      ),
    )
    .limit(1);

  return row;
}

export async function touchSession(sessionId: string, idleExpiresAt: Date): Promise<void> {
  await db.update(sessions).set({ idleExpiresAt }).where(eq(sessions.id, sessionId));
}

export async function deleteSessionByTokenHash(tokenHash: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}

/** Used on password change and on request, to end every other session. */
export async function deleteSessionsForUser(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function deleteExpiredSessions(now: Date): Promise<number> {
  const rows = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, now))
    .returning({ id: sessions.id });

  return rows.length;
}

/* -------------------------------------------------------------- audit log - */

export async function insertAuditEntry(input: {
  userId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  await db.insert(auditLog).values({
    userId: input.userId ?? null,
    action: input.action,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    metadata: input.metadata ?? null,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
}

/* ------------------------------------------------------------ rate limits - */

/**
 * Atomic fixed-window counter.
 *
 * The whole decision happens in one statement so two concurrent requests
 * cannot both read "4 of 5" and both proceed. When the stored window is older
 * than the window length, the upsert resets it rather than incrementing.
 */
export async function bumpRateLimit(
  key: string,
  windowSeconds: number,
  now: Date,
): Promise<number> {
  const [row] = await db
    .insert(rateLimits)
    .values({ key, count: 1, windowStartedAt: now })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case
          when ${rateLimits.windowStartedAt} < ${now.toISOString()}::timestamptz - make_interval(secs => ${windowSeconds})
          then 1
          else ${rateLimits.count} + 1
        end`,
        windowStartedAt: sql`case
          when ${rateLimits.windowStartedAt} < ${now.toISOString()}::timestamptz - make_interval(secs => ${windowSeconds})
          then ${now.toISOString()}::timestamptz
          else ${rateLimits.windowStartedAt}
        end`,
      },
    })
    .returning({ count: rateLimits.count });

  return row?.count ?? 1;
}

export async function clearRateLimit(key: string): Promise<void> {
  await db.delete(rateLimits).where(eq(rateLimits.key, key));
}

/* ---------------------------------------------------------------- oauth --- */

export async function insertOAuthState(input: {
  stateHash: string;
  codeVerifier: string;
  nonce: string;
  redirectTo: string | null;
  linkToUserId: string | null;
  expiresAt: Date;
}): Promise<void> {
  await db.insert(oauthStates).values(input);
}

/**
 * Consume the handshake row atomically.
 *
 * The delete-and-return makes the state single-use: a replayed callback finds
 * no row, so the same authorization code cannot be presented twice.
 */
export async function consumeOAuthState(
  stateHash: string,
  now: Date,
): Promise<typeof oauthStates.$inferSelect | undefined> {
  const [row] = await db
    .delete(oauthStates)
    .where(and(eq(oauthStates.stateHash, stateHash), gt(oauthStates.expiresAt, now)))
    .returning();

  return row;
}

export async function deleteExpiredOAuthStates(now: Date): Promise<number> {
  const rows = await db
    .delete(oauthStates)
    .where(lt(oauthStates.expiresAt, now))
    .returning({ stateHash: oauthStates.stateHash });

  return rows.length;
}

export async function findOAuthAccount(
  provider: string,
  subject: string,
): Promise<OAuthAccount | undefined> {
  const [row] = await db
    .select()
    .from(oauthAccounts)
    .where(and(eq(oauthAccounts.provider, provider), eq(oauthAccounts.subject, subject)))
    .limit(1);

  return row;
}

export async function listOAuthAccountsForUser(userId: string): Promise<OAuthAccount[]> {
  return db.select().from(oauthAccounts).where(eq(oauthAccounts.userId, userId));
}

export async function insertOAuthAccount(input: {
  userId: string;
  provider: string;
  subject: string;
  providerEmail: string | null;
}): Promise<OAuthAccount> {
  const [row] = await db
    .insert(oauthAccounts)
    .values({ ...input, lastUsedAt: new Date() })
    .returning();

  if (!row) throw new Error('OAuth account insert returned no row');
  return row;
}

export async function touchOAuthAccount(id: string): Promise<void> {
  await db.update(oauthAccounts).set({ lastUsedAt: new Date() }).where(eq(oauthAccounts.id, id));
}

/** Scoped by userId so one account cannot unlink another's provider. */
export async function deleteOAuthAccount(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(oauthAccounts)
    .where(and(eq(oauthAccounts.id, id), eq(oauthAccounts.userId, userId)))
    .returning({ id: oauthAccounts.id });

  return rows.length > 0;
}

/* -------------------------------------------------------------- profile --- */

export async function insertOAuthUser(input: {
  email: string;
  displayName: string;
  avatarUrl: string | null;
  dateOfBirth: string;
  timezone: string;
  baseCurrency: string;
  emailVerified: boolean;
}): Promise<User> {
  const now = new Date();
  const [row] = await db
    .insert(users)
    .values({
      email: input.email.toLowerCase(),
      // No local password: this account authenticates through the provider.
      // A random unusable hash is stored so the column is never null and a
      // password sign-in attempt fails normally rather than crashing.
      passwordHash: NO_PASSWORD,
      displayName: input.displayName,
      avatarUrl: input.avatarUrl,
      dateOfBirth: input.dateOfBirth,
      ageVerifiedAt: now,
      emailVerifiedAt: input.emailVerified ? now : null,
      timezone: input.timezone,
      baseCurrency: input.baseCurrency,
    })
    .returning();

  if (!row) throw new Error('User insert returned no row');
  return row;
}

/** A sentinel that no argon2 verification can ever match. */
export const NO_PASSWORD = 'oauth-only-account-no-local-password';

/**
 * Replace a user's password.
 *
 * Also marks the address verified if it was not already: completing a reset
 * means the person clicked a link that was only ever sent to that address,
 * which is the same proof a verification link gives.
 */
export async function setPasswordHash(
  userId: string,
  passwordHash: string,
  now: Date,
): Promise<void> {
  await db
    .update(users)
    .set({
      passwordHash,
      updatedAt: now,
      emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, ${now.toISOString()}::timestamptz)`,
    })
    .where(eq(users.id, userId));
}

export async function setUserVerifiedEmail(userId: string, at: Date): Promise<void> {
  await db.update(users).set({ emailVerifiedAt: at, updatedAt: at }).where(eq(users.id, userId));
}

export async function setUserAge(userId: string, dateOfBirth: string, at: Date): Promise<void> {
  await db
    .update(users)
    .set({ dateOfBirth, ageVerifiedAt: at, updatedAt: at })
    .where(eq(users.id, userId));
}

export async function completeOnboarding(userId: string, at: Date): Promise<void> {
  await db
    .update(users)
    .set({ onboardingCompletedAt: at, updatedAt: at })
    .where(eq(users.id, userId));
}

export async function updateProfile(
  userId: string,
  input: { displayName: string; timezone: string; locale: string },
): Promise<void> {
  await db
    .update(users)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

/* -------------------------------------------------------------- consent --- */

export async function insertConsent(input: {
  userId: string;
  kind: string;
  documentVersion: string;
  ip: string | null;
  userAgent: string | null;
}): Promise<void> {
  await db.insert(consents).values(input);
}

export async function revokeConsent(userId: string, kind: string): Promise<void> {
  await db
    .update(consents)
    .set({ revokedAt: new Date() })
    .where(and(eq(consents.userId, userId), eq(consents.kind, kind), isNull(consents.revokedAt)));
}

export async function listConsents(userId: string) {
  return db.select().from(consents).where(eq(consents.userId, userId));
}

/* ------------------------------------------------------- session listing --- */

/** For the "where you are signed in" screen. Never returns the token hash. */
export async function listSessionsForUser(userId: string, now: Date) {
  return db
    .select({
      id: sessions.id,
      ip: sessions.ip,
      userAgent: sessions.userAgent,
      client: sessions.client,
      createdAt: sessions.createdAt,
      expiresAt: sessions.expiresAt,
      idleExpiresAt: sessions.idleExpiresAt,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, now)))
    .orderBy(sessions.createdAt);
}

/** Scoped by userId: revoking is only ever possible on your own sessions. */
export async function deleteSessionForUser(userId: string, sessionId: string): Promise<boolean> {
  const rows = await db
    .delete(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
    .returning({ id: sessions.id });

  return rows.length > 0;
}

export async function deleteOtherSessionsForUser(
  userId: string,
  keepSessionId: string,
): Promise<number> {
  const rows = await db
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), ne(sessions.id, keepSessionId)))
    .returning({ id: sessions.id });

  return rows.length;
}

export async function findSessionIdByTokenHash(tokenHash: string): Promise<string | undefined> {
  const [row] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1);

  return row?.id;
}

/* ------------------------------------------------------------- deletion --- */

export async function markDeletionRequested(userId: string, at: Date): Promise<void> {
  await db
    .update(users)
    .set({ deletionRequestedAt: at, updatedAt: at })
    .where(eq(users.id, userId));
}

export async function cancelDeletionRequest(userId: string): Promise<void> {
  await db
    .update(users)
    .set({ deletionRequestedAt: null, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

/**
 * Irreversible hard delete. Every child table cascades from users.id, so this
 * removes the account's data rather than merely hiding it.
 */
export async function hardDeleteUser(userId: string): Promise<void> {
  await db.delete(users).where(eq(users.id, userId));

  /**
   * The cascade above fires the change-log triggers, so deleting the user
   * writes a final burst of 'deleted' entries. `change_log.user_id` has no
   * foreign key precisely so those inserts succeed; they are cleared here
   * instead, after the cascade has finished.
   */
  await db.execute(sql`delete from change_log where user_id = ${userId}`);
}

/* --------------------------------------------- pending registrations --- */

export async function insertPendingRegistration(input: {
  tokenHash: string;
  provider: string;
  subject: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  redirectTo: string | null;
  expiresAt: Date;
}): Promise<void> {
  await db.insert(pendingRegistrations).values(input);
}

export async function findPendingRegistration(
  tokenHash: string,
  now: Date,
): Promise<PendingRegistration | undefined> {
  const [row] = await db
    .select()
    .from(pendingRegistrations)
    .where(
      and(eq(pendingRegistrations.tokenHash, tokenHash), gt(pendingRegistrations.expiresAt, now)),
    )
    .limit(1);

  return row;
}

/** Consumed as it is read, so the same pending identity cannot be used twice. */
export async function consumePendingRegistration(
  tokenHash: string,
  now: Date,
): Promise<PendingRegistration | undefined> {
  const [row] = await db
    .delete(pendingRegistrations)
    .where(
      and(eq(pendingRegistrations.tokenHash, tokenHash), gt(pendingRegistrations.expiresAt, now)),
    )
    .returning();

  return row;
}

export async function deleteExpiredPendingRegistrations(now: Date): Promise<number> {
  const rows = await db
    .delete(pendingRegistrations)
    .where(lt(pendingRegistrations.expiresAt, now))
    .returning({ tokenHash: pendingRegistrations.tokenHash });

  return rows.length;
}
