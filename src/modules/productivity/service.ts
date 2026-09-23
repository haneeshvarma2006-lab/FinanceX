import { addDays, differenceInCalendarDays, parseISO } from 'date-fns';
import { conflict, invalid, notFound, ok, type Result } from '@/lib/result';
import * as repo from './repository';
import { buildRule, nextOccurrence, RecurrenceError } from '@nestedflow/domain/productivity';
import { summarise, type StreakSummary } from '@nestedflow/domain/productivity';
import {
  formatValue,
  isAchieved,
  normaliseValue,
  progressPercent,
  requiredDailyRate,
  GoalValueError,
  type GoalKind,
} from '@nestedflow/domain/productivity';
import { notify } from './notifications';
import type { Goal, Habit, Project, Task } from './schema';
import type { CheckpointInput, GoalInput, HabitInput, ProjectInput, TaskInput } from './validators';

/* -------------------------------------------------------------- projects --- */

export async function createProject(userId: string, input: ProjectInput): Promise<Result<Project>> {
  try {
    return ok(
      await repo.insertProject(userId, {
        name: input.name,
        description: input.description ?? null,
        color: input.color ?? null,
      }),
    );
  } catch {
    // The unique index on (userId, name) is the real guard; this is the copy.
    return invalid('name', 'You already have a project with that name');
  }
}

/* ----------------------------------------------------------------- tasks --- */

function parseDueAt(raw: string | undefined): Date | null | 'invalid' {
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? 'invalid' : parsed;
}

export async function createTask(userId: string, input: TaskInput): Promise<Result<Task>> {
  if (input.projectId) {
    // Ownership of the referenced project, not just of the task being written.
    const project = await repo.findProject(userId, input.projectId);
    if (!project) return notFound();
  }

  const dueAt = parseDueAt(input.dueAt || undefined);
  if (dueAt === 'invalid') return invalid('dueAt', 'That is not a valid date and time');

  let rrule: string | null = null;
  if (input.repeat) {
    try {
      rrule = buildRule(input.repeat, input.repeatInterval);
    } catch (error) {
      return invalid('repeat', error instanceof RecurrenceError ? error.message : 'Invalid repeat');
    }
  }

  return ok(
    await repo.insertTask(userId, {
      projectId: input.projectId || null,
      title: input.title,
      notes: input.notes ?? null,
      priority: input.priority,
      dueAt,
      scheduledFor: input.scheduledFor || null,
      estimateMinutes: input.estimateMinutes ?? null,
      rrule,
    }),
  );
}

export async function updateTask(
  userId: string,
  id: string,
  input: TaskInput,
): Promise<Result<Task>> {
  const existing = await repo.findTask(userId, id);
  if (!existing) return notFound();

  if (input.projectId) {
    const project = await repo.findProject(userId, input.projectId);
    if (!project) return notFound();
  }

  const dueAt = parseDueAt(input.dueAt || undefined);
  if (dueAt === 'invalid') return invalid('dueAt', 'That is not a valid date and time');

  let rrule: string | null = null;
  if (input.repeat) {
    try {
      rrule = buildRule(input.repeat, input.repeatInterval);
    } catch (error) {
      return invalid('repeat', error instanceof RecurrenceError ? error.message : 'Invalid repeat');
    }
  }

  const updated = await repo.updateTask(userId, id, {
    projectId: input.projectId || null,
    title: input.title,
    notes: input.notes ?? null,
    priority: input.priority,
    dueAt,
    scheduledFor: input.scheduledFor || null,
    estimateMinutes: input.estimateMinutes ?? null,
    rrule,
  });

  return updated ? ok(updated) : notFound();
}

export type CompletionResult = { task: Task; nextOccurrence: Task | null };

/**
 * Complete a task, materialising the next occurrence if it recurs.
 *
 * The next one is created here and only here — on completion, one at a time.
 * That is what keeps an "every day forever" task from becoming an unbounded
 * insert, and it means the next occurrence is scheduled relative to when the
 * work was actually done rather than when it was nominally due.
 */
export async function completeTask(
  userId: string,
  id: string,
  now: Date = new Date(),
): Promise<Result<CompletionResult>> {
  const existing = await repo.findTask(userId, id);
  if (!existing) return notFound();

  if (existing.status === 'done') {
    return conflict('That task is already complete', 'already_done');
  }

  const completed = await repo.updateTask(userId, id, { status: 'done', completedAt: now });
  if (!completed) return notFound();

  if (!existing.rrule) return ok({ task: completed, nextOccurrence: null });

  let next: Date | null;
  try {
    next = nextOccurrence(existing.rrule, now);
  } catch {
    // A corrupt rule must not block completing the task in front of the user.
    return ok({ task: completed, nextOccurrence: null });
  }

  if (!next) return ok({ task: completed, nextOccurrence: null });

  const follower = await repo.insertTask(userId, {
    projectId: existing.projectId,
    title: existing.title,
    notes: existing.notes,
    priority: existing.priority,
    // Preserve the time of day from the original due date, on the new date.
    dueAt: existing.dueAt ? next : null,
    scheduledFor: existing.scheduledFor ? next.toISOString().slice(0, 10) : null,
    estimateMinutes: existing.estimateMinutes,
    rrule: existing.rrule,
    recurrenceParentId: existing.recurrenceParentId ?? existing.id,
  });

  return ok({ task: completed, nextOccurrence: follower });
}

export async function reopenTask(userId: string, id: string): Promise<Result<Task>> {
  const existing = await repo.findTask(userId, id);
  if (!existing) return notFound();

  // The CHECK constraint requires completedAt and status to agree.
  const updated = await repo.updateTask(userId, id, { status: 'todo', completedAt: null });
  return updated ? ok(updated) : notFound();
}

export async function deleteTask(userId: string, id: string): Promise<Result<null>> {
  return (await repo.deleteTask(userId, id)) ? ok(null) : notFound();
}

/* ---------------------------------------------------------------- habits --- */

export async function createHabit(userId: string, input: HabitInput): Promise<Result<Habit>> {
  try {
    return ok(
      await repo.insertHabit(userId, {
        name: input.name,
        description: input.description ?? null,
        cadence: input.cadence,
        targetPerPeriod: input.targetPerPeriod,
        color: input.color ?? null,
      }),
    );
  } catch {
    return invalid('name', 'You already have a habit with that name');
  }
}

export async function logHabit(
  userId: string,
  input: { habitId: string; onDate: string; count: number; note?: string },
): Promise<Result<null>> {
  const habit = await repo.findHabit(userId, input.habitId);
  if (!habit) return notFound();

  await repo.upsertHabitEntry(userId, {
    habitId: input.habitId,
    onDate: input.onDate,
    count: input.count,
    note: input.note ?? null,
  });

  return ok(null);
}

export async function unlogHabit(
  userId: string,
  habitId: string,
  onDate: string,
): Promise<Result<null>> {
  const habit = await repo.findHabit(userId, habitId);
  if (!habit) return notFound();

  await repo.deleteHabitEntry(userId, habitId, onDate);
  return ok(null);
}

export type HabitWithStreak = Habit & { streak: StreakSummary };

/** Every habit with its streak, computed from entries in one query. */
export async function habitsWithStreaks(userId: string, today: string): Promise<HabitWithStreak[]> {
  const [list, entries] = await Promise.all([
    repo.listHabits(userId),
    // A year is enough to establish any streak worth showing.
    repo.habitEntryDatesSince(userId, addDays(parseISO(today), -400).toISOString().slice(0, 10)),
  ]);

  return list.map((habit) => ({
    ...habit,
    streak: summarise(entries.get(habit.id) ?? [], today),
  }));
}

/* ----------------------------------------------------------------- goals --- */

export async function createGoal(userId: string, input: GoalInput): Promise<Result<Goal>> {
  if (input.habitId) {
    const habit = await repo.findHabit(userId, input.habitId);
    if (!habit) return notFound();
  }

  let targetValue: string;
  try {
    targetValue = normaliseValue(input.kind, input.targetValue, input.currency || null);
  } catch (error) {
    return invalid(
      'targetValue',
      error instanceof GoalValueError || error instanceof Error ? error.message : 'Invalid target',
    );
  }

  if (BigInt(targetValue) <= 0n && input.kind !== 'milestone') {
    return invalid('targetValue', 'Set a target greater than zero');
  }

  return ok(
    await repo.insertGoal(userId, {
      title: input.title,
      description: input.description ?? null,
      kind: input.kind,
      targetValue,
      unit: input.unit ?? null,
      currency: input.currency || null,
      habitId: input.habitId || null,
      startsOn: input.startsOn || null,
      targetDate: input.targetDate || null,
    }),
  );
}

/**
 * Record progress.
 *
 * The checkpoint is the record and `currentValue` is a cache of the latest one,
 * which is what makes review history answerable rather than just showing today.
 */
export async function recordCheckpoint(
  userId: string,
  input: CheckpointInput,
): Promise<Result<Goal>> {
  const goal = await repo.findGoal(userId, input.goalId);
  if (!goal) return notFound();

  if (goal.status !== 'active') {
    return conflict('That goal is no longer active', 'goal_closed');
  }

  let value: string;
  try {
    value = normaliseValue(goal.kind as GoalKind, input.value, goal.currency);
  } catch (error) {
    return invalid('value', error instanceof Error ? error.message : 'Invalid value');
  }

  await repo.insertCheckpoint(userId, {
    goalId: goal.id,
    value,
    note: input.note ?? null,
  });

  const achieved = isAchieved(goal.kind as GoalKind, value, goal.targetValue);

  const updated = await repo.updateGoalProgress(userId, goal.id, {
    currentValue: value,
    status: achieved ? 'achieved' : 'active',
    achievedAt: achieved ? new Date() : null,
  });

  if (!updated) return notFound();

  if (achieved) {
    await notify(userId, {
      kind: 'goal_achieved',
      title: `Goal reached: ${goal.title}`,
      body: 'You hit your target. Worth a moment.',
      href: '/goals',
      entityType: 'goal',
      entityId: goal.id,
      // One notification per goal, ever.
      dedupeKey: `goal_achieved:${goal.id}`,
    });
  }

  return ok(updated);
}

export type GoalProgress = {
  goal: Goal;
  percent: number;
  currentLabel: string;
  targetLabel: string;
  daysRemaining: number | null;
  requiredPerDay: number | null;
  offTrack: boolean;
};

export function describeProgress(goal: Goal, today: string): GoalProgress {
  const kind = goal.kind as GoalKind;
  const percent = progressPercent(goal.currentValue, goal.targetValue);

  const daysRemaining = goal.targetDate
    ? differenceInCalendarDays(parseISO(goal.targetDate), parseISO(today))
    : null;

  const requiredPerDay =
    daysRemaining === null
      ? null
      : requiredDailyRate(goal.currentValue, goal.targetValue, daysRemaining);

  /**
   * Off track compares progress against elapsed time, so a goal at 20% with
   * 80% of its window gone is flagged — which is the only point at which the
   * warning is still actionable.
   */
  let offTrack = false;
  if (goal.status === 'active' && goal.startsOn && goal.targetDate && daysRemaining !== null) {
    const total = differenceInCalendarDays(parseISO(goal.targetDate), parseISO(goal.startsOn));
    if (total > 0) {
      const elapsed = total - Math.max(0, daysRemaining);
      const expectedPercent = (elapsed / total) * 100;
      offTrack = percent + 10 < expectedPercent;
    }
  }

  return {
    goal,
    percent,
    currentLabel: formatValue(kind, goal.currentValue, goal.currency),
    targetLabel: formatValue(kind, goal.targetValue, goal.currency),
    daysRemaining,
    requiredPerDay,
    offTrack,
  };
}
