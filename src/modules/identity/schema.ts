import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  date,
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
    avatarUrl: text(),

    /** Null until proven. Unverified accounts cannot receive non-essential mail. */
    emailVerifiedAt: timestamp({ withTimezone: true }),

    /**
     * Date of birth, collected for the age gate only.
     *
     * A self-declared date is NOT legal age verification in most jurisdictions
     * (see docs/AGE-POLICY.md); it is a good-faith gate, and the policy says so
     * rather than implying compliance it cannot deliver.
     */
    dateOfBirth: date(),
    /** Denormalised at sign-up so a gate check never needs date arithmetic. */
    ageVerifiedAt: timestamp({ withTimezone: true }),

    onboardingCompletedAt: timestamp({ withTimezone: true }),

    /**
     * Set when the user asks for deletion. The row is retained for the grace
     * period so an accidental or malicious deletion can be undone, then purged.
     */
    deletionRequestedAt: timestamp({ withTimezone: true }),
    timezone: varchar({ length: 64 }).notNull().default('Asia/Kolkata'),
    locale: varchar({ length: 16 }).notNull().default('en-IN'),
    baseCurrency: varchar({ length: 3 }).notNull().default('INR'),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [uniqueIndex('users_email_lower_key').on(sql`lower(${t.email})`)],
);

/**
 * A linked external identity.
 *
 * Duplicate-account prevention: the unique index on (provider, subject) stops
 * the same Google account being attached twice, and linking is keyed on a
 * *verified* email so an unverified address cannot be used to claim someone
 * else's account.
 */
export const oauthAccounts = pgTable(
  'oauth_accounts',
  {
    id: varchar({ length: 36 }).primaryKey().$defaultFn(newId),
    userId: varchar({ length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    provider: varchar({ length: 32 }).notNull(),
    /** The provider's stable subject claim — never the email, which can change. */
    subject: varchar({ length: 255 }).notNull(),

    /** Email as the provider asserted it, for audit. Not used for lookup. */
    providerEmail: varchar({ length: 320 }),

    linkedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex('oauth_accounts_provider_subject_key').on(t.provider, t.subject),
    index('oauth_accounts_user_id_idx').on(t.userId),
  ],
);

/**
 * Short-lived OAuth handshake state.
 *
 * Holds the CSRF state, the PKCE verifier, and the OIDC nonce between the
 * redirect out and the callback back. Rows are single-use and expire in
 * minutes, so a replayed callback finds nothing to consume.
 */
export const oauthStates = pgTable(
  'oauth_states',
  {
    /** The state value itself, hashed — it travels through the user agent. */
    stateHash: varchar({ length: 64 }).primaryKey(),
    codeVerifier: varchar({ length: 128 }).notNull(),
    nonce: varchar({ length: 64 }).notNull(),

    /** Where to land afterwards. Validated as a same-origin path before use. */
    redirectTo: varchar({ length: 512 }),

    /** Set when the account being linked is already signed in. */
    linkToUserId: varchar({ length: 36 }).references(() => users.id, { onDelete: 'cascade' }),

    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('oauth_states_expires_at_idx').on(t.expiresAt)],
);

/**
 * A verified external identity waiting for the user to finish signing up.
 *
 * A new person arriving via Google still has to pass the age gate and give
 * consent, so their verified identity is parked here between the OAuth
 * callback and the completion form. It lives in its own table, keyed by an
 * unguessable random id held in an httpOnly cookie — never in the query string,
 * where the email or subject could simply be edited.
 */
export const pendingRegistrations = pgTable(
  'pending_registrations',
  {
    /** Random; the raw value is the cookie, only its hash is stored. */
    tokenHash: varchar({ length: 64 }).primaryKey(),

    provider: varchar({ length: 32 }).notNull(),
    subject: varchar({ length: 255 }).notNull(),
    email: varchar({ length: 320 }).notNull(),
    displayName: varchar({ length: 120 }),
    avatarUrl: text(),

    redirectTo: varchar({ length: 512 }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('pending_registrations_expires_at_idx').on(t.expiresAt)],
);

/**
 * Explicit, versioned, revocable consent records.
 *
 * Versioned because consent to v1 of a privacy notice is not consent to v2;
 * without the version a later change silently inherits an old agreement.
 */
export const consents = pgTable(
  'consents',
  {
    id: varchar({ length: 36 }).primaryKey().$defaultFn(newId),
    userId: varchar({ length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    kind: varchar({ length: 48 }).notNull(),
    documentVersion: varchar({ length: 32 }).notNull(),

    grantedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp({ withTimezone: true }),

    ip: inet(),
    userAgent: varchar({ length: 512 }),
  },
  (t) => [index('consents_user_id_kind_idx').on(t.userId, t.kind)],
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

/**
 * Per-category email subscription state.
 *
 * Categories are separate rows rather than booleans on `users` so a new
 * category does not need a schema migration, and so an unsubscribe can target
 * exactly one category without touching the others.
 */
export const emailPreferences = pgTable(
  'email_preferences',
  {
    id: varchar({ length: 36 }).primaryKey().$defaultFn(newId),
    userId: varchar({ length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /** See EMAIL_CATEGORIES in modules/email/categories.ts */
    category: varchar({ length: 32 }).notNull(),
    subscribed: boolean().notNull().default(true),

    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('email_preferences_user_category_key').on(t.userId, t.category)],
);

/**
 * Address-level suppression, independent of any account.
 *
 * Keyed on the address rather than the user id on purpose: a hard bounce or a
 * spam complaint must keep suppressing that address even if the account is
 * deleted and someone later signs up with it again.
 */
export const emailSuppressions = pgTable(
  'email_suppressions',
  {
    email: varchar({ length: 320 }).primaryKey(),
    reason: varchar({ length: 32 }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('email_suppressions_created_at_idx').on(t.createdAt)],
);

/**
 * Single-use, expiring tokens for verification and one-click unsubscribe.
 *
 * Only the hash is stored, and `usedAt` gives replay protection: a token that
 * has been redeemed once is refused on every later presentation.
 */
export const emailTokens = pgTable(
  'email_tokens',
  {
    id: varchar({ length: 36 }).primaryKey().$defaultFn(newId),
    userId: varchar({ length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    kind: varchar({ length: 32 }).notNull(),
    tokenHash: varchar({ length: 64 }).notNull(),

    /** For unsubscribe tokens: which category this token turns off. */
    category: varchar({ length: 32 }),

    expiresAt: timestamp({ withTimezone: true }).notNull(),
    usedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('email_tokens_token_hash_key').on(t.tokenHash),
    index('email_tokens_user_id_kind_idx').on(t.userId, t.kind),
  ],
);

/**
 * Delivery record. Subject and category only — never the rendered body, which
 * would put personal and financial content into a second store for no benefit.
 */
export const emailLog = pgTable(
  'email_log',
  {
    id: varchar({ length: 36 }).primaryKey().$defaultFn(newId),
    userId: varchar({ length: 36 }).references(() => users.id, { onDelete: 'set null' }),

    category: varchar({ length: 32 }).notNull(),
    subject: varchar({ length: 256 }).notNull(),
    status: varchar({ length: 24 }).notNull(),
    /** Why a send was skipped: unsubscribed, suppressed, unverified. */
    skipReason: varchar({ length: 32 }),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('email_log_user_id_created_at_idx').on(t.userId, t.createdAt)],
);

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  oauthAccounts: many(oauthAccounts),
  emailPreferences: many(emailPreferences),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export type User = typeof users.$inferSelect;
export type OAuthAccount = typeof oauthAccounts.$inferSelect;
export type PendingRegistration = typeof pendingRegistrations.$inferSelect;
export type EmailPreference = typeof emailPreferences.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
