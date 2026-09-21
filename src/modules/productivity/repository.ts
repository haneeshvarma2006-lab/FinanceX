import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { containsPattern } from '@/lib/query';
import {
  focusSessions,
  goalCheckpoints,
  goals,
  habitEntries,
  habits,
  notificationPreferences,
  notifications,
  projects,
  tasks,
  type Goal,
  type GoalCheckpoint,
  type Habit,
  type HabitEntry,
  type Notification,
  type Project,
  type Task,
} from './schema';

/** As everywhere: `userId` first, filtered on, no exceptions. */

/* ------------------------------------------------------------- projects --- */

export async function listProjects(userId: string): Promise<Project[]> {
  return db
    .select()
    .from(projects)
    .where(and(eq(projects.userId, userId), isNull(projects.archivedAt)))
    .orderBy(asc(projects.name));
}

export async function findProject(userId: string, id: string): Promise<Project | undefined> {
  const [row] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .limit(1);

  return row;
}

export async function insertProject(
  userId: string,
  input: { name: string; description: string | null; color: string | null },
): Promise<Project> {
  const [row] = await db
    .insert(projects)
    .values({ userId, ...input })
    .returning();

  if (!row) throw new Error('Project insert returned no row');
  return row;
}

export async function archiveProject(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .update(projects)
    .set({ archivedAt: new Date() })
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .returning({ id: projects.id });

  return rows.length > 0;
}

/* ---------------------------------------------------------------- tasks --- */

export const TASK_SORT_COLUMNS = [
  'createdAt',
  'dueAt',
  'scheduledFor',
  'priority',
  'title',
] as const;
export type TaskSort = (typeof TASK_SORT_COLUMNS)[number];

export type TaskFilter = {
  status?: string[];
  projectId?: string;
  /** Inclusive calendar-day bounds on scheduledFor. */
  scheduledFrom?: string;
  scheduledTo?: string;
  /** Due strictly before this instant, for the overdue view. */
  dueBefore?: Date;
  search?: string;
  sort?: TaskSort;
  direction?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
};

function taskConditions(userId: string, filter: TaskFilter) {
  const conditions = [eq(tasks.userId, userId)];

  if (filter.status?.length) conditions.push(inArray(tasks.status, filter.status));
  if (filter.projectId) conditions.push(eq(tasks.projectId, filter.projectId));
  if (filter.scheduledFrom) conditions.push(gte(tasks.scheduledFor, filter.scheduledFrom));
  if (filter.scheduledTo) conditions.push(lte(tasks.scheduledFor, filter.scheduledTo));
  if (filter.dueBefore) conditions.push(lte(tasks.dueAt, filter.dueBefore));

  if (filter.search) {
    // Wildcards in the term are escaped by containsPattern, so searching for
    // "50%" does not become "match anything after 50".
    const pattern = containsPattern(filter.search);
    conditions.push(
      or(
        sql`${tasks.title} ilike ${pattern} escape '\\'`,
        sql`${tasks.notes} ilike ${pattern} escape '\\'`,
      )!,
    );
  }

  return conditions;
}

export async function listTasks(userId: string, filter: TaskFilter = {}): Promise<Task[]> {
  const column = {
    createdAt: tasks.createdAt,
    dueAt: tasks.dueAt,
    scheduledFor: tasks.scheduledFor,
    priority: tasks.priority,
    title: tasks.title,
  }[filter.sort ?? 'createdAt'];

  const order = filter.direction === 'asc' ? asc(column) : desc(column);

  return (
    db
      .select()
      .from(tasks)
      .where(and(...taskConditions(userId, filter)))
      // Secondary key keeps ordering stable across pages when the primary ties.
      .orderBy(order, asc(tasks.sortKey), asc(tasks.id))
      .limit(Math.min(filter.limit ?? 50, 100))
      .offset(filter.offset ?? 0)
  );
}

export async function countTasks(userId: string, filter: TaskFilter = {}): Promise<number> {
  const [row] = await db
    .select({ count: sql<string>`count(*)::text` })
    .from(tasks)
    .where(and(...taskConditions(userId, filter)));

  return Number(row?.count ?? 0);
}

export async function findTask(userId: string, id: string): Promise<Task | undefined> {
  const [row] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
    .limit(1);

  return row;
}

export type NewTask = {
  projectId: string | null;
  title: string;
  notes: string | null;
  priority: number;
  dueAt: Date | null;
  scheduledFor: string | null;
  estimateMinutes: number | null;
  rrule: string | null;
  recurrenceParentId?: string | null;
};

export async function insertTask(userId: string, input: NewTask): Promise<Task> {
  const [row] = await db
    .insert(tasks)
    .values({ userId, ...input, recurrenceParentId: input.recurrenceParentId ?? null })
    .returning();

  if (!row) throw new Error('Task insert returned no row');
  return row;
}

export async function updateTask(
  userId: string,
  id: string,
  input: Partial<NewTask> & { status?: string; completedAt?: Date | null },
): Promise<Task | undefined> {
  const [row] = await db
    .update(tasks)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
    .returning();

  return row;
}

export async function deleteTask(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
    .returning({ id: tasks.id });

  return rows.length > 0;
}

/** Counts for the dashboard, in one round trip rather than four. */
export async function taskCounts(
  userId: string,
  today: string,
  now: Date,
): Promise<{ openToday: number; overdue: number; completedToday: number; openTotal: number }> {
  const [row] = await db
    .select({
      openToday: sql<string>`count(*) filter (where ${tasks.status} in ('todo','doing') and ${tasks.scheduledFor} = ${today})::text`,
      overdue: sql<string>`count(*) filter (where ${tasks.status} in ('todo','doing') and ${tasks.dueAt} < ${now.toISOString()}::timestamptz)::text`,
      completedToday: sql<string>`count(*) filter (where ${tasks.status} = 'done' and ${tasks.completedAt} >= ${today}::date)::text`,
      openTotal: sql<string>`count(*) filter (where ${tasks.status} in ('todo','doing'))::text`,
    })
    .from(tasks)
    .where(eq(tasks.userId, userId));

  return {
    openToday: Number(row?.openToday ?? 0),
    overdue: Number(row?.overdue ?? 0),
    completedToday: Number(row?.completedToday ?? 0),
    openTotal: Number(row?.openTotal ?? 0),
  };
}

/* -------------------------------------------------------- focus sessions --- */

export async function insertFocusSession(
  userId: string,
  input: { taskId: string | null; startedAt: Date; plannedMinutes: number },
): Promise<void> {
  await db.insert(focusSessions).values({ userId, ...input });
}

export async function endFocusSession(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .update(focusSessions)
    .set({ endedAt: new Date() })
    .where(and(eq(focusSessions.id, id), eq(focusSessions.userId, userId)))
    .returning({ id: focusSessions.id });

  return rows.length > 0;
}

export async function focusMinutesSince(userId: string, since: Date): Promise<number> {
  const [row] = await db
    .select({
      minutes: sql<string>`coalesce(sum(extract(epoch from (${focusSessions.endedAt} - ${focusSessions.startedAt})) / 60), 0)::int::text`,
    })
    .from(focusSessions)
    .where(
      and(
        eq(focusSessions.userId, userId),
        gte(focusSessions.startedAt, since),
        sql`${focusSessions.endedAt} is not null`,
      ),
    );

  return Number(row?.minutes ?? 0);
}

/* --------------------------------------------------------------- habits --- */

export async function listHabits(userId: string): Promise<Habit[]> {
  return db
    .select()
    .from(habits)
    .where(and(eq(habits.userId, userId), isNull(habits.archivedAt)))
    .orderBy(asc(habits.name));
}

export async function findHabit(userId: string, id: string): Promise<Habit | undefined> {
  const [row] = await db
    .select()
    .from(habits)
    .where(and(eq(habits.id, id), eq(habits.userId, userId)))
    .limit(1);

  return row;
}

export async function insertHabit(
  userId: string,
  input: {
    name: string;
    description: string | null;
    cadence: string;
    targetPerPeriod: number;
    color: string | null;
  },
): Promise<Habit> {
  const [row] = await db
    .insert(habits)
    .values({ userId, ...input })
    .returning();

  if (!row) throw new Error('Habit insert returned no row');
  return row;
}

export async function archiveHabit(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .update(habits)
    .set({ archivedAt: new Date() })
    .where(and(eq(habits.id, id), eq(habits.userId, userId)))
    .returning({ id: habits.id });

  return rows.length > 0;
}

/**
 * Log a habit for a day. Idempotent by (habitId, onDate).
 *
 * A double tap must not create two entries — the unique index enforces it and
 * the upsert makes the second tap a no-op rather than an error the UI has to
 * explain.
 */
export async function upsertHabitEntry(
  userId: string,
  input: { habitId: string; onDate: string; count: number; note: string | null },
): Promise<void> {
  await db
    .insert(habitEntries)
    .values({ userId, ...input })
    .onConflictDoUpdate({
      target: [habitEntries.habitId, habitEntries.onDate],
      set: { count: input.count, note: input.note },
    });
}

export async function deleteHabitEntry(
  userId: string,
  habitId: string,
  onDate: string,
): Promise<boolean> {
  const rows = await db
    .delete(habitEntries)
    .where(
      and(
        eq(habitEntries.userId, userId),
        eq(habitEntries.habitId, habitId),
        eq(habitEntries.onDate, onDate),
      ),
    )
    .returning({ id: habitEntries.id });

  return rows.length > 0;
}

export async function listHabitEntries(
  userId: string,
  habitId: string,
  from: string,
): Promise<HabitEntry[]> {
  return db
    .select()
    .from(habitEntries)
    .where(
      and(
        eq(habitEntries.userId, userId),
        eq(habitEntries.habitId, habitId),
        gte(habitEntries.onDate, from),
      ),
    )
    .orderBy(asc(habitEntries.onDate));
}

/** Every habit's entry dates since `from`, for computing all streaks at once. */
export async function habitEntryDatesSince(
  userId: string,
  from: string,
): Promise<Map<string, string[]>> {
  const rows = await db
    .select({ habitId: habitEntries.habitId, onDate: habitEntries.onDate })
    .from(habitEntries)
    .where(and(eq(habitEntries.userId, userId), gte(habitEntries.onDate, from)))
    .orderBy(asc(habitEntries.onDate));

  const byHabit = new Map<string, string[]>();
  for (const row of rows) {
    const list = byHabit.get(row.habitId) ?? [];
    list.push(row.onDate);
    byHabit.set(row.habitId, list);
  }
  return byHabit;
}

/* ---------------------------------------------------------------- goals --- */

export async function listGoals(userId: string, status?: string): Promise<Goal[]> {
  const conditions = [eq(goals.userId, userId)];
  if (status) conditions.push(eq(goals.status, status));

  return db
    .select()
    .from(goals)
    .where(and(...conditions))
    .orderBy(asc(goals.targetDate), desc(goals.createdAt));
}

export async function findGoal(userId: string, id: string): Promise<Goal | undefined> {
  const [row] = await db
    .select()
    .from(goals)
    .where(and(eq(goals.id, id), eq(goals.userId, userId)))
    .limit(1);

  return row;
}

export async function insertGoal(
  userId: string,
  input: {
    title: string;
    description: string | null;
    kind: string;
    targetValue: string;
    unit: string | null;
    currency: string | null;
    habitId: string | null;
    startsOn: string | null;
    targetDate: string | null;
  },
): Promise<Goal> {
  const [row] = await db
    .insert(goals)
    .values({ userId, ...input })
    .returning();

  if (!row) throw new Error('Goal insert returned no row');
  return row;
}

export async function updateGoalProgress(
  userId: string,
  goalId: string,
  input: { currentValue: string; status: string; achievedAt: Date | null },
): Promise<Goal | undefined> {
  const [row] = await db
    .update(goals)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(goals.id, goalId), eq(goals.userId, userId)))
    .returning();

  return row;
}

export async function deleteGoal(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(goals)
    .where(and(eq(goals.id, id), eq(goals.userId, userId)))
    .returning({ id: goals.id });

  return rows.length > 0;
}

export async function insertCheckpoint(
  userId: string,
  input: { goalId: string; value: string; note: string | null },
): Promise<GoalCheckpoint> {
  const [row] = await db
    .insert(goalCheckpoints)
    .values({ userId, ...input })
    .returning();

  if (!row) throw new Error('Checkpoint insert returned no row');
  return row;
}

export async function listCheckpoints(userId: string, goalId: string): Promise<GoalCheckpoint[]> {
  return db
    .select()
    .from(goalCheckpoints)
    .where(and(eq(goalCheckpoints.userId, userId), eq(goalCheckpoints.goalId, goalId)))
    .orderBy(desc(goalCheckpoints.recordedAt));
}

/* --------------------------------------------------------- notifications --- */

export async function listNotifications(
  userId: string,
  options: { unreadOnly?: boolean; limit?: number } = {},
): Promise<Notification[]> {
  const conditions = [eq(notifications.userId, userId)];
  if (options.unreadOnly) conditions.push(isNull(notifications.readAt));

  return db
    .select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt))
    .limit(Math.min(options.limit ?? 30, 100));
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<string>`count(*)::text` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));

  return Number(row?.count ?? 0);
}

/**
 * Raise a notification.
 *
 * `onConflictDoNothing` against the dedupe key means re-running a digest or
 * re-evaluating a budget cannot spam the same message twice.
 */
export async function insertNotification(input: {
  userId: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  entityType: string | null;
  entityId: string | null;
  dedupeKey: string | null;
}): Promise<boolean> {
  const rows = await db
    .insert(notifications)
    .values(input)
    .onConflictDoNothing()
    .returning({ id: notifications.id });

  return rows.length > 0;
}

export async function markNotificationRead(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(eq(notifications.id, id), eq(notifications.userId, userId), isNull(notifications.readAt)),
    )
    .returning({ id: notifications.id });

  return rows.length > 0;
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  const rows = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .returning({ id: notifications.id });

  return rows.length;
}

export async function listNotificationPreferences(userId: string) {
  return db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId));
}

export async function setNotificationPreference(
  userId: string,
  kind: string,
  enabled: boolean,
): Promise<void> {
  await db
    .insert(notificationPreferences)
    .values({ userId, kind, enabled })
    .onConflictDoUpdate({
      target: [notificationPreferences.userId, notificationPreferences.kind],
      set: { enabled, updatedAt: new Date() },
    });
}

export async function isNotificationKindEnabled(userId: string, kind: string): Promise<boolean> {
  const [row] = await db
    .select({ enabled: notificationPreferences.enabled })
    .from(notificationPreferences)
    .where(and(eq(notificationPreferences.userId, userId), eq(notificationPreferences.kind, kind)))
    .limit(1);

  // Absent means never configured; default on rather than silently dropping.
  return row?.enabled ?? true;
}
