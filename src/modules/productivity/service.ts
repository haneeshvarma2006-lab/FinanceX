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
import * as financeRepo from '@/modules/finance/repository';
import * as tradingRepo from '@/modules/trading/repository';
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
  if (input.goalId) {
    const goal = await repo.findGoal(userId, input.goalId);
    if (!goal) return notFound();
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
      goalId: input.goalId || null,
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
  if (input.goalId) {
    const goal = await repo.findGoal(userId, input.goalId);
    if (!goal) return notFound();
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
    goalId: input.goalId || null,
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
    goalId: existing.goalId,
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

  // A goal that follows an account is a money goal in that account's currency.
  let kind = input.kind;
  let currency: string | null = input.currency || null;
  let accountId: string | null = null;
  let tradingAccountId: string | null = null;
  let sourceName: string | null = null;

  if (input.source === 'account') {
    const account = await financeRepo.findAccount(userId, input.accountId ?? '');
    if (!account) return notFound();
    kind = 'financial';
    currency = account.currency;
    accountId = account.id;
    sourceName = account.name;
  } else if (input.source === 'trading') {
    const account = await tradingRepo.findTradingAccount(userId, input.tradingAccountId ?? '');
    if (!account) return notFound();
    kind = 'financial';
    currency = account.currency;
    tradingAccountId = account.id;
    sourceName = account.name;
  }

  let targetValue: string;
  try {
    targetValue = normaliseValue(kind, input.targetValue, currency);
  } catch (error) {
    return invalid(
      'targetValue',
      error instanceof GoalValueError || error instanceof Error ? error.message : 'Invalid target',
    );
  }

  if (BigInt(targetValue) <= 0n && kind !== 'milestone') {
    return invalid('targetValue', 'Set a target greater than zero');
  }

  const goal = await repo.insertGoal(userId, {
    title: input.title,
    description: input.description ?? null,
    kind,
    targetValue,
    unit: input.unit ?? null,
    currency,
    habitId: input.habitId || null,
    startsOn: input.startsOn || null,
    targetDate: input.targetDate || null,
    accountId,
    tradingAccountId,
  });

  if (input.starterTasks) {
    for (const starter of starterTasksFor(input.source, sourceName)) {
      await repo.insertTask(userId, {
        projectId: null,
        goalId: goal.id,
        title: starter.title,
        notes: starter.notes,
        priority: 2,
        dueAt: null,
        scheduledFor: null,
        estimateMinutes: starter.minutes,
        rrule: buildRule(starter.repeat, 1),
      });
    }
  }

  return ok(goal);
}

/**
 * A goal becomes action: a few recurring tasks that move this kind of goal
 * forward, linked to it, created only when the user ticks the box.
 */
function starterTasksFor(
  source: GoalInput['source'],
  accountName: string | null,
): { title: string; notes: string; minutes: number; repeat: 'daily' | 'weekly' | 'monthly' }[] {
  if (source === 'trading') {
    return [
      {
        title: 'Journal review',
        notes: 'Go through this week’s trades: what followed the plan, and what did not.',
        minutes: 30,
        repeat: 'weekly',
      },
      {
        title: 'Risk management review',
        notes: 'Check position sizes and drawdown against your limits.',
        minutes: 20,
        repeat: 'weekly',
      },
      {
        title: 'Weekly analysis',
        notes: 'Look for patterns across winners and losers before next week.',
        minutes: 30,
        repeat: 'weekly',
      },
    ];
  }
  if (source === 'account') {
    return [
      {
        title: accountName ? `Move money into ${accountName}` : 'Move money toward this goal',
        notes: 'Pay yourself first, before the month decides for you.',
        minutes: 10,
        repeat: 'monthly',
      },
      {
        title: 'Review this week’s spending',
        notes: 'Find one thing to cut, and send the difference to the goal.',
        minutes: 15,
        repeat: 'weekly',
      },
    ];
  }
  return [
    {
      title: 'Plan the next step',
      notes: 'Pick the single action that moves this goal forward this week.',
      minutes: 15,
      repeat: 'weekly',
    },
  ];
}

/**
 * Bring goals that follow an account up to date.
 *
 * Runs before a page that shows goals renders. When the balance or the
 * realised profit has moved since the last checkpoint, the new value is
 * recorded as a checkpoint — the same append-only history a manual check-in
 * writes — so "every deposit, as a checkpoint" is literally true.
 */
export async function syncLinkedGoals(userId: string): Promise<void> {
  const active = (await repo.listGoals(userId, 'active')).filter(
    (g) => g.accountId || g.tradingAccountId,
  );
  if (active.length === 0) return;

  const balances = active.some((g) => g.accountId)
    ? await financeRepo.accountBalances(userId)
    : new Map<string, bigint>();

  for (const goal of active) {
    let value: bigint;
    let note: string;
    if (goal.accountId) {
      value = balances.get(goal.accountId) ?? 0n;
      note = 'Balance of the linked account';
    } else {
      const since = goal.startsOn ? new Date(`${goal.startsOn}T00:00:00Z`) : goal.createdAt;
      value = await tradingRepo.realizedPnlSince(userId, goal.tradingAccountId!, since);
      note = 'Realised profit on the linked trading account';
    }
    if (value.toString() === goal.currentValue) continue;
    await applyProgress(userId, goal, value < 0n ? '0' : value.toString(), note);
  }
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

  return applyProgress(userId, goal, value, input.note ?? null);
}

/**
 * Record a value against a goal: the checkpoint, the cached current value,
 * and — the first time the target is met — the achievement and its one
 * notification. Shared by manual check-ins and linked-account sync.
 */
async function applyProgress(
  userId: string,
  goal: Goal,
  value: string,
  note: string | null,
): Promise<Result<Goal>> {
  await repo.insertCheckpoint(userId, { goalId: goal.id, value, note });

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
