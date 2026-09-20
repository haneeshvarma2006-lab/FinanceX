import { relations, sql } from 'drizzle-orm';
import {
  index,
  inet,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { newId } from '@/lib/db/id';

export const users = pgTable(
  'users',
  {
    id: varchar({ length: 36 }).primaryKey().$defaultFn(newId),

    /**
     * Stored lower-cased and compared case-insensitively via the unique index
     * below, so Alice@example.com and alice@example.com cannot both register.
     */
    email: varchar({ length: 320 }).notNull(),
    passwordHash: text().notNull(),

    displayName: varchar({ length: 120 }).notNull(),
    timezone: varchar({ length: 64 }).notNull().default('Asia/Kolkata'),
    locale: varchar({ length: 16 }).notNull().default('en-IN'),
    baseCurrency: varchar({ length: 3 }).notNull().default('INR'),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [uniqueIndex('users_email_lower_key').on(sql`lower(${t.email})`)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: varchar({ length: 36 }).primaryKey().$defaultFn(newId),
    userId: varchar({ length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /**
     * Only the SHA-256 of the session token is stored. A database disclosure
     * therefore does not hand the attacker usable sessions.
     */
    tokenHash: varchar({ length: 64 }).notNull(),

    /** Hard ceiling on session age, regardless of activity. */
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    /** Rolls forward on use; a session idle past this is dead. */
    idleExpiresAt: timestamp({ withTimezone: true }).notNull(),

    ip: inet(),
    userAgent: varchar({ length: 512 }),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('sessions_token_hash_key').on(t.tokenHash),
    index('sessions_user_id_idx').on(t.userId),
    index('sessions_expires_at_idx').on(t.expiresAt),
  ],
);

/**
 * Append-only. Nothing in the application updates or deletes a row here; that
 * is the point of an audit trail.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: varchar({ length: 36 }).primaryKey().$defaultFn(newId),

    /** Nullable: a failed sign-in for an unknown address has no user. */
    userId: varchar({ length: 36 }).references(() => users.id, { onDelete: 'set null' }),

    action: varchar({ length: 64 }).notNull(),
    entityType: varchar({ length: 64 }),
    entityId: varchar({ length: 36 }),

    metadata: jsonb().$type<Record<string, unknown>>(),
    ip: inet(),
    userAgent: varchar({ length: 512 }),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_log_user_id_created_at_idx').on(t.userId, t.createdAt),
    index('audit_log_action_created_at_idx').on(t.action, t.createdAt),
  ],
);

/**
 * Fixed-window counters for sign-in and sign-up throttling.
 *
 * Deliberately in Postgres rather than in memory: an in-process counter resets
 * on every deploy and is useless across more than one instance, which makes it
 * a rate limiter in name only.
 */
export const rateLimits = pgTable(
  'rate_limits',
  {
    /** e.g. "signin:ip:203.0.113.4" or "signin:account:alice@example.com" */
    key: varchar({ length: 200 }).primaryKey(),
    count: integer().notNull().default(0),
    windowStartedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('rate_limits_window_started_at_idx').on(t.windowStartedAt)],
);

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
