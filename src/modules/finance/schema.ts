import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
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
 * Money columns are `bigint` minor units with an explicit currency alongside.
 * No monetary value in this schema is a float or a numeric-with-scale that a
 * driver might hand back as a JavaScript number.
 */

export const accounts = pgTable(
  'accounts',
  {
    id: varchar({ length: 36 }).primaryKey().$defaultFn(newId),
    userId: varchar({ length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    name: varchar({ length: 120 }).notNull(),
    /** cash | bank | card | investment | broker | loan */
    kind: varchar({ length: 24 }).notNull(),
    currency: varchar({ length: 3 }).notNull(),

    // A bigint literal default cannot be serialised by drizzle-kit; a SQL
    // default expresses the same thing and survives migration generation.
    openingBalanceMinor: bigint({ mode: 'bigint' })
      .notNull()
      .default(sql`0`),

    archivedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('accounts_user_id_idx').on(t.userId),
    uniqueIndex('accounts_user_name_key').on(t.userId, t.name),
    check(
      'accounts_kind_check',
      sql`${t.kind} in ('cash','bank','card','investment','broker','loan')`,
    ),
  ],
);

export const categories = pgTable(
  'categories',
  {
    id: varchar({ length: 36 }).primaryKey().$defaultFn(newId),
    userId: varchar({ length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    name: varchar({ length: 80 }).notNull(),
    /** income | expense */
    kind: varchar({ length: 16 }).notNull(),
    color: varchar({ length: 16 }),
    icon: varchar({ length: 32 }),

    archivedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('categories_user_id_idx').on(t.userId),
    uniqueIndex('categories_user_name_kind_key').on(t.userId, t.name, t.kind),
    check('categories_kind_check', sql`${t.kind} in ('income','expense')`),
  ],
);

/**
 * The ledger.
 *
 * A transfer is two rows sharing a `transferGroupId` with opposite signs, and
 * `kind = 'transfer'`. Income and expense totals filter transfers out, so
 * moving money between your own accounts never inflates either — the single
 * most common arithmetic bug in personal finance software.
 */
export const transactions = pgTable(
  'transactions',
  {
    id: varchar({ length: 36 }).primaryKey().$defaultFn(newId),
    userId: varchar({ length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: varchar({ length: 36 })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    categoryId: varchar({ length: 36 }).references(() => categories.id, {
      onDelete: 'set null',
    }),

    /** Calendar day in the user's timezone, not an instant. */
    occurredOn: date().notNull(),

    /** Signed: negative is money leaving the account. */
    amountMinor: bigint({ mode: 'bigint' }).notNull(),
    currency: varchar({ length: 3 }).notNull(),

    /** income | expense | transfer */
    kind: varchar({ length: 16 }).notNull(),

    description: varchar({ length: 240 }).notNull(),
    merchant: varchar({ length: 120 }),
    notes: text(),

    transferGroupId: varchar({ length: 36 }),

    /**
     * Stable identifier from an import source. Unique per account, so
     * re-importing the same CSV updates nothing and duplicates nothing.
     */
    externalId: varchar({ length: 200 }),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('transactions_user_occurred_idx').on(t.userId, t.occurredOn),
    index('transactions_account_occurred_idx').on(t.accountId, t.occurredOn),
    index('transactions_user_category_idx').on(t.userId, t.categoryId),
    index('transactions_transfer_group_idx').on(t.transferGroupId),
    uniqueIndex('transactions_account_external_key')
      .on(t.accountId, t.externalId)
      .where(sql`${t.externalId} is not null`),
    check('transactions_kind_check', sql`${t.kind} in ('income','expense','transfer')`),
    check('transactions_amount_nonzero', sql`${t.amountMinor} <> 0`),
  ],
);

export const budgets = pgTable(
  'budgets',
  {
    id: varchar({ length: 36 }).primaryKey().$defaultFn(newId),
    userId: varchar({ length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    categoryId: varchar({ length: 36 })
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),

    /** monthly | weekly */
    period: varchar({ length: 16 }).notNull(),
    amountMinor: bigint({ mode: 'bigint' }).notNull(),
    currency: varchar({ length: 3 }).notNull(),

    startsOn: date().notNull(),
    endsOn: date(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('budgets_user_id_idx').on(t.userId),
    uniqueIndex('budgets_user_category_period_key').on(t.userId, t.categoryId, t.startsOn),
    check('budgets_period_check', sql`${t.period} in ('monthly','weekly')`),
    check('budgets_amount_positive', sql`${t.amountMinor} > 0`),
  ],
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: varchar({ length: 36 }).primaryKey().$defaultFn(newId),
    userId: varchar({ length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: varchar({ length: 36 }).references(() => accounts.id, { onDelete: 'set null' }),
    categoryId: varchar({ length: 36 }).references(() => categories.id, {
      onDelete: 'set null',
    }),

    name: varchar({ length: 120 }).notNull(),
    amountMinor: bigint({ mode: 'bigint' }).notNull(),
    currency: varchar({ length: 3 }).notNull(),

    /** monthly | quarterly | yearly | weekly */
    cadence: varchar({ length: 16 }).notNull(),
    nextDueOn: date().notNull(),
    lastChargedOn: date(),

    /** active | paused | cancelled */
    status: varchar({ length: 16 }).notNull().default('active'),
    cancelBy: date(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('subscriptions_user_next_due_idx').on(t.userId, t.nextDueOn),
    check(
      'subscriptions_cadence_check',
      sql`${t.cadence} in ('weekly','monthly','quarterly','yearly')`,
    ),
    check('subscriptions_status_check', sql`${t.status} in ('active','paused','cancelled')`),
  ],
);

export const netWorthSnapshots = pgTable(
  'net_worth_snapshots',
  {
    id: varchar({ length: 36 }).primaryKey().$defaultFn(newId),
    userId: varchar({ length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    onDate: date().notNull(),
    assetsMinor: bigint({ mode: 'bigint' }).notNull(),
    liabilitiesMinor: bigint({ mode: 'bigint' }).notNull(),
    currency: varchar({ length: 3 }).notNull(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('net_worth_user_date_key').on(t.userId, t.onDate)],
);

/**
 * Audit-friendly history for material financial records.
 *
 * Append-only. Stores the before/after of a change rather than only the fact
 * that one happened, so a user can answer "what did this say last month?"
 * without a database backup.
 */
export const recordRevisions = pgTable(
  'record_revisions',
  {
    id: varchar({ length: 36 }).primaryKey().$defaultFn(newId),
    userId: varchar({ length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    entityType: varchar({ length: 40 }).notNull(),
    entityId: varchar({ length: 36 }).notNull(),
    /** created | updated | deleted */
    action: varchar({ length: 16 }).notNull(),

    before: jsonb().$type<Record<string, unknown> | null>(),
    after: jsonb().$type<Record<string, unknown> | null>(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('record_revisions_entity_idx').on(t.entityType, t.entityId, t.createdAt),
    index('record_revisions_user_idx').on(t.userId, t.createdAt),
  ],
);

export const accountsRelations = relations(accounts, ({ many }) => ({
  transactions: many(transactions),
}));

export type Account = typeof accounts.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Budget = typeof budgets.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
