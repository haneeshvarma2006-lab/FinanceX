import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { automationRuns, automationRules, type AutomationRule, type AutomationRun } from './schema';

/** As everywhere: `userId` first, filtered on. */

export async function listRules(userId: string): Promise<AutomationRule[]> {
  return db
    .select()
    .from(automationRules)
    .where(eq(automationRules.userId, userId))
    .orderBy(desc(automationRules.enabled), automationRules.name);
}

export async function listEnabledRules(userId: string): Promise<AutomationRule[]> {
  return db
    .select()
    .from(automationRules)
    .where(and(eq(automationRules.userId, userId), eq(automationRules.enabled, true)))
    .orderBy(automationRules.name);
}

export async function findRule(userId: string, id: string): Promise<AutomationRule | undefined> {
  const [row] = await db
    .select()
    .from(automationRules)
    .where(and(eq(automationRules.id, id), eq(automationRules.userId, userId)))
    .limit(1);

  return row;
}

export async function insertRule(
  userId: string,
  input: {
    name: string;
    triggerType: string;
    triggerConfig: Record<string, unknown>;
    actionType: string;
    actionConfig: Record<string, unknown>;
  },
): Promise<AutomationRule> {
  const [row] = await db
    .insert(automationRules)
    .values({ userId, ...input })
    .returning();

  if (!row) throw new Error('Rule insert returned no row');
  return row;
}

export async function setRuleEnabled(
  userId: string,
  id: string,
  enabled: boolean,
): Promise<boolean> {
  const rows = await db
    .update(automationRules)
    .set({ enabled, updatedAt: new Date() })
    .where(and(eq(automationRules.id, id), eq(automationRules.userId, userId)))
    .returning({ id: automationRules.id });

  return rows.length > 0;
}

export async function markRuleFired(userId: string, id: string, at: Date): Promise<void> {
  await db
    .update(automationRules)
    .set({ lastFiredAt: at })
    .where(and(eq(automationRules.id, id), eq(automationRules.userId, userId)));
}

export async function deleteRule(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(automationRules)
    .where(and(eq(automationRules.id, id), eq(automationRules.userId, userId)))
    .returning({ id: automationRules.id });

  return rows.length > 0;
}

/* -------------------------------------------------------------- runs --- */

export async function insertRun(input: {
  userId: string;
  ruleId: string;
  status: string;
  reason: string;
  observed: Record<string, unknown> | null;
}): Promise<void> {
  await db.insert(automationRuns).values(input);
}

export async function listRuns(
  userId: string,
  options: { ruleId?: string; limit?: number } = {},
): Promise<AutomationRun[]> {
  const conditions = [eq(automationRuns.userId, userId)];
  if (options.ruleId) conditions.push(eq(automationRuns.ruleId, options.ruleId));

  return db
    .select()
    .from(automationRuns)
    .where(and(...conditions))
    .orderBy(desc(automationRuns.firedAt))
    .limit(Math.min(options.limit ?? 50, 200));
}

/**
 * Trim the run log.
 *
 * Every evaluation is recorded, including the misses, so the log grows on
 * every dashboard load. Keeping the most recent N per rule preserves the
 * "why didn't it fire?" answer without an unbounded table.
 */
export async function pruneRuns(userId: string, keepPerRule = 50): Promise<number> {
  const result = await db.execute(sql`
    delete from ${automationRuns}
    where ${automationRuns.userId} = ${userId}
      and ${automationRuns.id} in (
        select id from (
          select ${automationRuns.id} as id,
                 row_number() over (
                   partition by ${automationRuns.ruleId}
                   order by ${automationRuns.firedAt} desc
                 ) as rn
          from ${automationRuns}
          where ${automationRuns.userId} = ${userId}
        ) ranked
        where ranked.rn > ${keepPerRule}
      )
  `);

  return result.rowCount ?? 0;
}
