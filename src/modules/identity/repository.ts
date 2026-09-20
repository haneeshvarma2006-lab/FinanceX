import { and, eq, gt, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { auditLog, rateLimits, sessions, users, type Session, type User } from './schema';

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
  timezone: string;
  baseCurrency: string;
}): Promise<User> {
  const [row] = await db
    .insert(users)
    .values({
      email: input.email.toLowerCase(),
      passwordHash: input.passwordHash,
      displayName: input.displayName,
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
