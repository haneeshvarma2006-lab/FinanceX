import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import {
  emailLog,
  emailPreferences,
  emailSuppressions,
  emailTokens,
  type EmailPreference,
} from './schema';
import { EMAIL_CATEGORY_KEYS, defaultSubscribed, type EmailCategory } from './categories';

/* -------------------------------------------------------- preferences --- */

export async function listPreferences(userId: string): Promise<EmailPreference[]> {
  return db.select().from(emailPreferences).where(eq(emailPreferences.userId, userId));
}

/** Called at sign-up. Idempotent, so a retried registration cannot duplicate rows. */
export async function seedPreferences(userId: string): Promise<void> {
  await db
    .insert(emailPreferences)
    .values(
      EMAIL_CATEGORY_KEYS.map((category) => ({
        userId,
        category,
        subscribed: defaultSubscribed(category),
      })),
    )
    .onConflictDoNothing();
}

export async function setPreference(
  userId: string,
  category: EmailCategory,
  subscribed: boolean,
): Promise<void> {
  await db
    .insert(emailPreferences)
    .values({ userId, category, subscribed })
    .onConflictDoUpdate({
      target: [emailPreferences.userId, emailPreferences.category],
      set: { subscribed, updatedAt: new Date() },
    });
}

export async function findPreference(
  userId: string,
  category: EmailCategory,
): Promise<EmailPreference | undefined> {
  const [row] = await db
    .select()
    .from(emailPreferences)
    .where(and(eq(emailPreferences.userId, userId), eq(emailPreferences.category, category)))
    .limit(1);

  return row;
}

/* -------------------------------------------------------- suppression --- */

export async function isSuppressed(email: string): Promise<boolean> {
  const [row] = await db
    .select({ email: emailSuppressions.email })
    .from(emailSuppressions)
    .where(sql`lower(${emailSuppressions.email}) = lower(${email})`)
    .limit(1);

  return Boolean(row);
}

export async function suppress(email: string, reason: string): Promise<void> {
  await db
    .insert(emailSuppressions)
    .values({ email: email.toLowerCase(), reason })
    .onConflictDoNothing();
}

export async function unsuppress(email: string): Promise<void> {
  await db.delete(emailSuppressions).where(eq(emailSuppressions.email, email.toLowerCase()));
}

/* ------------------------------------------------------------- tokens --- */

export async function insertToken(input: {
  userId: string;
  kind: string;
  tokenHash: string;
  category: string | null;
  expiresAt: Date;
}): Promise<void> {
  await db.insert(emailTokens).values(input);
}

/**
 * Delete a user's unredeemed tokens of one kind.
 *
 * Issuing a new password-reset link calls this first, so only the most recent
 * email in an inbox works. An older link that surfaces later — forwarded, or
 * read over someone's shoulder — is dead.
 */
export async function deleteUnusedTokens(userId: string, kind: string): Promise<void> {
  await db
    .delete(emailTokens)
    .where(
      and(eq(emailTokens.userId, userId), eq(emailTokens.kind, kind), isNull(emailTokens.usedAt)),
    );
}

/**
 * Read a live token without redeeming it.
 *
 * For showing "this link has expired" before someone types a new password.
 * Deliberately NOT a redemption: mail scanners and link previews open every
 * URL in a message, and a GET that burned the token would break the link
 * before its owner ever clicked it.
 */
export async function findLiveToken(
  tokenHash: string,
  kind: string,
  now: Date,
): Promise<typeof emailTokens.$inferSelect | undefined> {
  const [row] = await db
    .select()
    .from(emailTokens)
    .where(
      and(
        eq(emailTokens.tokenHash, tokenHash),
        eq(emailTokens.kind, kind),
        isNull(emailTokens.usedAt),
        sql`${emailTokens.expiresAt} > ${now.toISOString()}::timestamptz`,
      ),
    )
    .limit(1);

  return row;
}

/**
 * Redeem a token atomically.
 *
 * The update sets `usedAt` and returns the row in one statement, and the
 * `usedAt is null` predicate is part of that statement. Two concurrent
 * redemptions therefore cannot both succeed — which is what replay protection
 * actually means, as opposed to checking and then updating.
 */
export async function redeemToken(
  tokenHash: string,
  kind: string,
  now: Date,
): Promise<typeof emailTokens.$inferSelect | undefined> {
  const [row] = await db
    .update(emailTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(emailTokens.tokenHash, tokenHash),
        eq(emailTokens.kind, kind),
        isNull(emailTokens.usedAt),
        sql`${emailTokens.expiresAt} > ${now.toISOString()}::timestamptz`,
      ),
    )
    .returning();

  return row;
}

export async function deleteExpiredTokens(now: Date): Promise<number> {
  const rows = await db
    .delete(emailTokens)
    .where(sql`${emailTokens.expiresAt} < ${now.toISOString()}::timestamptz`)
    .returning({ id: emailTokens.id });

  return rows.length;
}

/* ---------------------------------------------------------------- log --- */

export async function insertLog(input: {
  userId: string | null;
  category: string;
  subject: string;
  status: string;
  skipReason?: string | null;
}): Promise<void> {
  await db.insert(emailLog).values({ ...input, skipReason: input.skipReason ?? null });
}

export async function listLogForUser(userId: string) {
  return db.select().from(emailLog).where(eq(emailLog.userId, userId));
}
