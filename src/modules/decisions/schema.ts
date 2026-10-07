import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';
import { newId } from '@/lib/db/id';
import { users } from '@/modules/identity/schema';

/**
 * The decision journal.
 *
 * A decision is written down before its outcome is known — what was chosen,
 * why, what is expected and how sure you are — and judged later, against
 * what was written rather than against memory. The gap between the two is
 * the whole point: hindsight rewrites reasons, a dated entry cannot.
 */
export const decisions = pgTable(
  'decisions',
  {
    id: varchar({ length: 36 }).primaryKey().$defaultFn(newId),
    userId: varchar({ length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /** The decision, in one line. */
    title: varchar({ length: 200 }).notNull(),
    /** See DECISION_AREAS. */
    area: varchar({ length: 16 }).notNull().default('life'),
    reasoning: text(),
    expected: text(),
    /** 1..5, how sure you were at the time. */
    confidence: smallint(),
    /** The day to come back and judge it. */
    reviewOn: date(),

    /** Filled in at review. */
    outcome: text(),
    /** right | mixed | wrong */
    verdict: varchar({ length: 16 }),
    reviewedAt: timestamp({ withTimezone: true }),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('decisions_user_created_idx').on(t.userId, t.createdAt),
    index('decisions_user_review_idx').on(t.userId, t.reviewOn),
    check('decisions_area_check', sql`${t.area} in ('work','money','trading','life')`),
    check(
      'decisions_verdict_check',
      sql`${t.verdict} is null or ${t.verdict} in ('right','mixed','wrong')`,
    ),
    check(
      'decisions_confidence_range',
      sql`${t.confidence} is null or ${t.confidence} between 1 and 5`,
    ),
    check('decisions_reasoning_length', sql`char_length(${t.reasoning}) <= 4000`),
    check('decisions_expected_length', sql`char_length(${t.expected}) <= 2000`),
    check('decisions_outcome_length', sql`char_length(${t.outcome}) <= 4000`),
  ],
);

export type Decision = typeof decisions.$inferSelect;
