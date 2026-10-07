import { and, asc, desc, eq, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { decisions, type Decision } from './schema';
import type { DecisionInput, DecisionReviewInput } from './validators';

/** As everywhere: `userId` first, filtered on, no exceptions. */

export async function listDecisions(userId: string, limit = 200): Promise<Decision[]> {
  return db
    .select()
    .from(decisions)
    .where(eq(decisions.userId, userId))
    .orderBy(desc(decisions.createdAt))
    .limit(limit);
}

/** Open decisions whose review day has arrived, oldest first. */
export async function listDueDecisions(userId: string, today: string): Promise<Decision[]> {
  return db
    .select()
    .from(decisions)
    .where(
      and(
        eq(decisions.userId, userId),
        isNull(decisions.verdict),
        isNotNull(decisions.reviewOn),
        lte(decisions.reviewOn, today),
      ),
    )
    .orderBy(asc(decisions.reviewOn));
}

export async function countDecisionsBetween(
  userId: string,
  from: Date,
  to: Date,
): Promise<{ made: number; reviewed: number; right: number; wrong: number }> {
  const [row] = await db
    .select({
      made: sql<number>`count(*) filter (where ${decisions.createdAt} >= ${from} and ${decisions.createdAt} < ${to})::int`,
      reviewed: sql<number>`count(*) filter (where ${decisions.reviewedAt} >= ${from} and ${decisions.reviewedAt} < ${to})::int`,
      right: sql<number>`count(*) filter (where ${decisions.reviewedAt} >= ${from} and ${decisions.reviewedAt} < ${to} and ${decisions.verdict} = 'right')::int`,
      wrong: sql<number>`count(*) filter (where ${decisions.reviewedAt} >= ${from} and ${decisions.reviewedAt} < ${to} and ${decisions.verdict} = 'wrong')::int`,
    })
    .from(decisions)
    .where(eq(decisions.userId, userId));
  return row ?? { made: 0, reviewed: 0, right: 0, wrong: 0 };
}

export async function createDecision(userId: string, input: DecisionInput): Promise<Decision> {
  const [row] = await db
    .insert(decisions)
    .values({
      userId,
      title: input.title,
      area: input.area,
      reasoning: input.reasoning ?? null,
      expected: input.expected ?? null,
      confidence: input.confidence ?? null,
      reviewOn: input.reviewOn ?? null,
    })
    .returning();
  return row!;
}

export async function reviewDecision(
  userId: string,
  input: DecisionReviewInput,
  now: Date = new Date(),
): Promise<Decision | undefined> {
  const [row] = await db
    .update(decisions)
    .set({
      verdict: input.verdict,
      outcome: input.outcome ?? null,
      reviewedAt: now,
      updatedAt: now,
    })
    .where(and(eq(decisions.id, input.id), eq(decisions.userId, userId)))
    .returning();
  return row;
}

/** Undo a review, so a decision judged too early can be judged again later. */
export async function reopenDecision(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .update(decisions)
    .set({ verdict: null, outcome: null, reviewedAt: null, updatedAt: new Date() })
    .where(and(eq(decisions.id, id), eq(decisions.userId, userId)))
    .returning({ id: decisions.id });
  return rows.length > 0;
}

export async function deleteDecision(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(decisions)
    .where(and(eq(decisions.id, id), eq(decisions.userId, userId)))
    .returning({ id: decisions.id });
  return rows.length > 0;
}
