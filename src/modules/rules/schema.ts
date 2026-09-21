import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { newId } from '@/lib/db/id';
import { users } from '@/modules/identity/schema';

/**
 * User-defined automation.
 *
 * Rules are DATA, never code. The trigger and action are each a named type
 * plus a typed, Zod-validated config object — there is no expression to
 * evaluate, no template to interpolate, and nothing a user can put in a rule
 * that the engine will execute. That is a deliberate boundary: a rules engine
 * that evaluates user-supplied expressions is a remote code execution feature
 * wearing a friendly hat.
 */
export const automationRules = pgTable(
  'automation_rules',
  {
    id: varchar({ length: 36 }).primaryKey().$defaultFn(newId),
    userId: varchar({ length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    name: varchar({ length: 120 }).notNull(),
    enabled: boolean().notNull().default(true),

    /** See TRIGGERS in triggers.ts. */
    triggerType: varchar({ length: 48 }).notNull(),
    triggerConfig: jsonb().$type<Record<string, unknown>>().notNull().default({}),

    /** See ACTIONS in actions.ts. */
    actionType: varchar({ length: 48 }).notNull(),
    actionConfig: jsonb().$type<Record<string, unknown>>().notNull().default({}),

    lastFiredAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('automation_rules_user_enabled_idx').on(t.userId, t.enabled),
    uniqueIndex('automation_rules_user_name_key').on(t.userId, t.name),
  ],
);

/**
 * Every evaluation, not just every firing.
 *
 * A rule that quietly does nothing is indistinguishable from a broken one
 * unless the misses are recorded too. This is what lets the UI answer "why
 * didn't that fire?" — which is the question users actually ask.
 */
export const automationRuns = pgTable(
  'automation_runs',
  {
    id: varchar({ length: 36 }).primaryKey().$defaultFn(newId),
    userId: varchar({ length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    ruleId: varchar({ length: 36 })
      .notNull()
      .references(() => automationRules.id, { onDelete: 'cascade' }),

    /** fired | not_matched | suppressed | error */
    status: varchar({ length: 16 }).notNull(),
    /** Plain-language explanation, shown to the user verbatim. */
    reason: text().notNull(),

    /** The observed values the decision was made from, for auditability. */
    observed: jsonb().$type<Record<string, unknown>>(),

    firedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('automation_runs_rule_fired_idx').on(t.ruleId, t.firedAt),
    index('automation_runs_user_fired_idx').on(t.userId, t.firedAt),
    check(
      'automation_runs_status_check',
      sql`${t.status} in ('fired','not_matched','suppressed','error')`,
    ),
  ],
);

export type AutomationRule = typeof automationRules.$inferSelect;
export type AutomationRun = typeof automationRuns.$inferSelect;
