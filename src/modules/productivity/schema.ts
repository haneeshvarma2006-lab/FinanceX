import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { newId } from '@/lib/db/id';
import { users } from '@/modules/identity/schema';

/**
 * Tasks, projects, habits and goals.
 *
 * One module because they share a single question — "what should I do, and am
 * I keeping to it?" — and because the dashboard reads them together. Splitting
 * them would mean a join across module boundaries on the hottest query in the
 * product.
 */

export const projects = pgTable(
  'projects',
  {
    id: varchar({ length: 36 }).primaryKey().$defaultFn(newId),
    userId: varchar({ length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    name: varchar({ length: 120 }).notNull(),
    description: varchar({ length: 500 }),
    color: varchar({ length: 16 }),

    archivedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('projects_user_id_idx').on(t.userId),
    uniqueIndex('projects_user_name_key').on(t.userId, t.name),
  ],
);

export const tasks = pgTable(
  'tasks',
  {
    id: varchar({ length: 36 }).primaryKey().$defaultFn(newId),
    userId: varchar({ length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    projectId: varchar({ length: 36 }).references(() => projects.id, { onDelete: 'set null' }),

    title: varchar({ length: 240 }).notNull(),
    notes: text(),

    /** todo | doing | done | cancelled */
    status: varchar({ length: 16 }).notNull().default('todo'),
    /** 1 highest .. 4 lowest. Matches the four-level convention users expect. */
    priority: smallint().notNull().default(3),

    /** A hard deadline — an instant, because "due at 5pm" is a real thing. */
    dueAt: timestamp({ withTimezone: true }),
    /** The day you intend to do it. A calendar day, not an instant. */
    scheduledFor: date(),
    estimateMinutes: integer(),

    completedAt: timestamp({ withTimezone: true }),

    /**
     * RFC 5545 RRULE. Only the NEXT occurrence is ever materialised, on
     * completion — expanding an infinite series into rows is how a recurring
     * task list becomes unusable.
     */
    rrule: varchar({ length: 500 }),
    /** The task this one was generated from, for a recurring series. */
    recurrenceParentId: varchar({ length: 36 }),

    /** Manual ordering within a day or project. Sparse, so a reorder is one write. */
    sortKey: integer().notNull().default(0),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The dashboard's hottest query: this user's open work, by day.
    index('tasks_user_status_scheduled_idx').on(t.userId, t.status, t.scheduledFor),
    index('tasks_user_due_idx').on(t.userId, t.dueAt),
    index('tasks_project_idx').on(t.projectId),
    index('tasks_recurrence_parent_idx').on(t.recurrenceParentId),
    check('tasks_status_check', sql`${t.status} in ('todo','doing','done','cancelled')`),
    check('tasks_priority_check', sql`${t.priority} between 1 and 4`),
    // A done task must record when; anything else makes streaks and history lie.
    check(
      'tasks_completed_consistency',
      sql`(${t.status} = 'done') = (${t.completedAt} is not null)`,
    ),
  ],
);

/** A focus block. Kept separate from tasks so a session survives task deletion. */
export const focusSessions = pgTable(
  'focus_sessions',
  {
    id: varchar({ length: 36 }).primaryKey().$defaultFn(newId),
    userId: varchar({ length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    taskId: varchar({ length: 36 }).references(() => tasks.id, { onDelete: 'set null' }),

    startedAt: timestamp({ withTimezone: true }).notNull(),
    endedAt: timestamp({ withTimezone: true }),
    plannedMinutes: integer().notNull().default(25),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('focus_sessions_user_started_idx').on(t.userId, t.startedAt)],
);

export const habits = pgTable(
  'habits',
  {
    id: varchar({ length: 36 }).primaryKey().$defaultFn(newId),
    userId: varchar({ length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    name: varchar({ length: 120 }).notNull(),
    description: varchar({ length: 500 }),
    color: varchar({ length: 16 }),

    /** daily | weekly */
    cadence: varchar({ length: 16 }).notNull().default('daily'),
    /** How many times per period counts as done. */
    targetPerPeriod: smallint().notNull().default(1),

    archivedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('habits_user_id_idx').on(t.userId),
    uniqueIndex('habits_user_name_key').on(t.userId, t.name),
    check('habits_cadence_check', sql`${t.cadence} in ('daily','weekly')`),
    check('habits_target_positive', sql`${t.targetPerPeriod} > 0`),
  ],
);

/**
 * One row per habit per day.
 *
 * The unique constraint is what makes logging idempotent: a double tap cannot
 * create two entries, and a streak computed from these rows cannot double-count.
 */
export const habitEntries = pgTable(
  'habit_entries',
  {
    id: varchar({ length: 36 }).primaryKey().$defaultFn(newId),
    userId: varchar({ length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    habitId: varchar({ length: 36 })
      .notNull()
      .references(() => habits.id, { onDelete: 'cascade' }),

    onDate: date().notNull(),
    count: smallint().notNull().default(1),
    note: varchar({ length: 500 }),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('habit_entries_habit_date_key').on(t.habitId, t.onDate),
    index('habit_entries_user_date_idx').on(t.userId, t.onDate),
    check('habit_entries_count_positive', sql`${t.count} > 0`),
  ],
);

export const goals = pgTable(
  'goals',
  {
    id: varchar({ length: 36 }).primaryKey().$defaultFn(newId),
    userId: varchar({ length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    title: varchar({ length: 200 }).notNull(),
    description: text(),

    /**
     * numeric   — count toward a number (books read, kilometres run)
     * financial — a money target, in minor units of `currency`
     * habit     — sustain a habit for a period
     * milestone — a binary done/not-done outcome
     */
    kind: varchar({ length: 16 }).notNull().default('numeric'),

    /**
     * Stored as text and parsed by the domain, because a financial goal's
     * value is integer minor units while a numeric goal's may be fractional.
     * One numeric column cannot serve both without losing precision on one.
     */
    targetValue: varchar({ length: 32 }).notNull(),
    currentValue: varchar({ length: 32 }).notNull().default('0'),
    unit: varchar({ length: 24 }),
    currency: varchar({ length: 3 }),

    /** Set for a habit-kind goal. */
    habitId: varchar({ length: 36 }).references(() => habits.id, { onDelete: 'set null' }),

    startsOn: date(),
    targetDate: date(),

    /** active | achieved | abandoned */
    status: varchar({ length: 16 }).notNull().default('active'),
    achievedAt: timestamp({ withTimezone: true }),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('goals_user_status_idx').on(t.userId, t.status),
    index('goals_user_target_date_idx').on(t.userId, t.targetDate),
    check('goals_kind_check', sql`${t.kind} in ('numeric','financial','habit','milestone')`),
    check('goals_status_check', sql`${t.status} in ('active','achieved','abandoned')`),
    check(
      'goals_financial_has_currency',
      sql`${t.kind} <> 'financial' or ${t.currency} is not null`,
    ),
  ],
);

/**
 * Append-only progress history.
 *
 * `goals.currentValue` is a cache of the latest checkpoint. The checkpoints are
 * the record — which is what makes "review history" answerable rather than just
 * showing today's number.
 */
export const goalCheckpoints = pgTable(
  'goal_checkpoints',
  {
    id: varchar({ length: 36 }).primaryKey().$defaultFn(newId),
    userId: varchar({ length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    goalId: varchar({ length: 36 })
      .notNull()
      .references(() => goals.id, { onDelete: 'cascade' }),

    value: varchar({ length: 32 }).notNull(),
    note: varchar({ length: 500 }),
    recordedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('goal_checkpoints_goal_recorded_idx').on(t.goalId, t.recordedAt)],
);

/**
 * In-app notifications.
 *
 * Distinct from email: these are always available and need no provider, which
 * is why they are the notification channel that actually works in this build.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: varchar({ length: 36 }).primaryKey().$defaultFn(newId),
    userId: varchar({ length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /** See NOTIFICATION_KINDS. Governs which preference gates it. */
    kind: varchar({ length: 40 }).notNull(),
    title: varchar({ length: 200 }).notNull(),
    body: varchar({ length: 1000 }),

    /** Where clicking it should go. Validated as a same-origin path on write. */
    href: varchar({ length: 300 }),

    entityType: varchar({ length: 40 }),
    entityId: varchar({ length: 36 }),

    /**
     * Deduplication key. A unique partial index on this stops the same daily
     * digest or the same budget warning being raised twice.
     */
    dedupeKey: varchar({ length: 200 }),

    readAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('notifications_user_created_idx').on(t.userId, t.createdAt),
    // Partial: only unread rows, which is the only list the bell ever queries.
    index('notifications_user_unread_idx')
      .on(t.userId, t.createdAt)
      .where(sql`${t.readAt} is null`),
    uniqueIndex('notifications_user_dedupe_key')
      .on(t.userId, t.dedupeKey)
      .where(sql`${t.dedupeKey} is not null`),
  ],
);

/** Per-user, per-kind switch for in-app notifications. */
export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    id: varchar({ length: 36 }).primaryKey().$defaultFn(newId),
    userId: varchar({ length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    kind: varchar({ length: 40 }).notNull(),
    enabled: boolean().notNull().default(true),

    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('notification_preferences_user_kind_key').on(t.userId, t.kind)],
);

export type Project = typeof projects.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type FocusSession = typeof focusSessions.$inferSelect;
export type Habit = typeof habits.$inferSelect;
export type HabitEntry = typeof habitEntries.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type GoalCheckpoint = typeof goalCheckpoints.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
