import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '@/lib/db/client';
import * as identity from '@/modules/identity/service';
import { signUpSchema } from '@/modules/identity/validators';
import * as repo from '@/modules/productivity/repository';
import * as productivity from '@/modules/productivity/service';
import { notify, seedNotificationPreferences } from '@/modules/productivity/notifications';

const ctx = { ip: '203.0.113.80', userAgent: 'vitest' };

async function reset() {
  await pool.query('truncate table users cascade');
  await pool.query('truncate table rate_limits');
}

async function makeUser(email = 'doer@example.com') {
  const result = await identity.signUp(
    signUpSchema.parse({
      email,
      password: 'a sufficiently long passphrase',
      dateOfBirth: '1990-01-01',
      acceptedTerms: true,
      displayName: 'Doer',
    }),
    ctx,
  );
  if (!result.ok) throw new Error('setup failed');
  return result.user;
}

beforeEach(reset);
afterAll(async () => {
  await reset();
  await pool.end();
});

describe('tasks', () => {
  it('creates and completes a task', async () => {
    const user = await makeUser();

    const created = await productivity.createTask(user.id, {
      title: 'Review trading journal',
      priority: 2,
      repeatInterval: 1,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.status).toBe('todo');
    expect(created.value.completedAt).toBeNull();

    const done = await productivity.completeTask(user.id, created.value.id);
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.value.task.status).toBe('done');
    expect(done.value.task.completedAt).not.toBeNull();
  });

  it('refuses to complete a task twice', async () => {
    const user = await makeUser();
    const created = await productivity.createTask(user.id, {
      title: 'Once only',
      priority: 3,
      repeatInterval: 1,
    });
    if (!created.ok) throw new Error('setup failed');

    await productivity.completeTask(user.id, created.value.id);
    const again = await productivity.completeTask(user.id, created.value.id);

    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.error.kind).toBe('conflict');
  });

  it('enforces the status/completedAt invariant at the database level', async () => {
    const user = await makeUser();
    const created = await productivity.createTask(user.id, {
      title: 'Invariant',
      priority: 3,
      repeatInterval: 1,
    });
    if (!created.ok) throw new Error('setup failed');

    // A done task with no completion time would make history and streaks lie.
    await expect(
      pool.query("update tasks set status = 'done' where id = $1", [created.value.id]),
    ).rejects.toThrow();
  });

  it('reopens a completed task and clears the completion time', async () => {
    const user = await makeUser();
    const created = await productivity.createTask(user.id, {
      title: 'Reopen me',
      priority: 3,
      repeatInterval: 1,
    });
    if (!created.ok) throw new Error('setup failed');

    await productivity.completeTask(user.id, created.value.id);
    const reopened = await productivity.reopenTask(user.id, created.value.id);

    expect(reopened.ok).toBe(true);
    if (!reopened.ok) return;
    expect(reopened.value.status).toBe('todo');
    expect(reopened.value.completedAt).toBeNull();
  });

  it('rejects a project that is not the caller own', async () => {
    const alice = await makeUser('alice@example.com');
    const bob = await makeUser('bob@example.com');

    const bobProject = await repo.insertProject(bob.id, {
      name: 'Bob work',
      description: null,
      color: null,
    });

    const result = await productivity.createTask(alice.id, {
      title: 'Into your project',
      priority: 3,
      projectId: bobProject.id,
      repeatInterval: 1,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('not_found');
  });

  it('rejects an invalid due date', async () => {
    const user = await makeUser();
    const result = await productivity.createTask(user.id, {
      title: 'Bad date',
      priority: 3,
      dueAt: 'not-a-date',
      repeatInterval: 1,
    });

    expect(result.ok).toBe(false);
  });
});

describe('recurring tasks', () => {
  it('materialises exactly ONE next occurrence on completion', async () => {
    const user = await makeUser();

    const created = await productivity.createTask(user.id, {
      title: 'Daily review',
      priority: 3,
      scheduledFor: '2026-09-20',
      repeat: 'daily',
      repeatInterval: 1,
    });
    if (!created.ok) throw new Error('setup failed');

    const done = await productivity.completeTask(
      user.id,
      created.value.id,
      new Date('2026-09-20T18:00:00Z'),
    );

    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.value.nextOccurrence).not.toBeNull();
    expect(done.value.nextOccurrence!.scheduledFor).toBe('2026-09-21');

    // Exactly two rows: the completed one and its single successor. An
    // eagerly-expanded series would have created many.
    expect(await repo.countTasks(user.id)).toBe(2);
  });

  it('links the successor back to the original series', async () => {
    const user = await makeUser();
    const created = await productivity.createTask(user.id, {
      title: 'Weekly',
      priority: 3,
      scheduledFor: '2026-09-20',
      repeat: 'weekly',
      repeatInterval: 1,
    });
    if (!created.ok) throw new Error('setup failed');

    const done = await productivity.completeTask(
      user.id,
      created.value.id,
      new Date('2026-09-20T18:00:00Z'),
    );
    if (!done.ok || !done.value.nextOccurrence) throw new Error('no successor');

    expect(done.value.nextOccurrence.recurrenceParentId).toBe(created.value.id);
    expect(done.value.nextOccurrence.scheduledFor).toBe('2026-09-27');
  });

  it('schedules from the completion date, not the original due date', async () => {
    const user = await makeUser();
    const created = await productivity.createTask(user.id, {
      title: 'Completed late',
      priority: 3,
      scheduledFor: '2026-09-20',
      repeat: 'daily',
      repeatInterval: 1,
    });
    if (!created.ok) throw new Error('setup failed');

    // Completed three days late: the next one must not be in the past.
    const done = await productivity.completeTask(
      user.id,
      created.value.id,
      new Date('2026-09-23T10:00:00Z'),
    );

    if (!done.ok || !done.value.nextOccurrence) throw new Error('no successor');
    expect(done.value.nextOccurrence.scheduledFor).toBe('2026-09-24');
  });

  it('creates no successor for a non-recurring task', async () => {
    const user = await makeUser();
    const created = await productivity.createTask(user.id, {
      title: 'One off',
      priority: 3,
      repeatInterval: 1,
    });
    if (!created.ok) throw new Error('setup failed');

    const done = await productivity.completeTask(user.id, created.value.id);
    expect(done.ok && done.value.nextOccurrence).toBeNull();
    expect(await repo.countTasks(user.id)).toBe(1);
  });

  it('chains across repeated completions without duplicating', async () => {
    const user = await makeUser();
    const current = await productivity.createTask(user.id, {
      title: 'Chained',
      priority: 3,
      scheduledFor: '2026-09-20',
      repeat: 'daily',
      repeatInterval: 1,
    });
    if (!current.ok) throw new Error('setup failed');

    let id = current.value.id;
    for (let day = 20; day < 25; day += 1) {
      const done = await productivity.completeTask(
        user.id,
        id,
        new Date(`2026-09-${day}T18:00:00Z`),
      );
      if (!done.ok || !done.value.nextOccurrence) throw new Error('chain broke');
      id = done.value.nextOccurrence.id;
    }

    // Five completions plus one open successor.
    expect(await repo.countTasks(user.id)).toBe(6);
    expect(await repo.countTasks(user.id, { status: ['todo'] })).toBe(1);
  });
});

describe('task search and filtering', () => {
  it('searches title and notes, escaping wildcards', async () => {
    const user = await makeUser();

    for (const title of ['Pay rent', 'Review 50% allocation', 'Buy milk']) {
      await productivity.createTask(user.id, { title, priority: 3, repeatInterval: 1 });
    }

    expect(await repo.countTasks(user.id, { search: 'rent' })).toBe(1);

    /**
     * A literal % must be matched literally, not treated as a wildcard.
     * Unescaped, '%' would expand to "match anything" and return all three
     * tasks; escaped, it matches only the one title that actually contains a
     * percent sign.
     */
    expect(await repo.countTasks(user.id, { search: '50%' })).toBe(1);
    expect(await repo.countTasks(user.id, { search: '%' })).toBe(1);
    expect(await repo.countTasks(user.id, { search: '_' })).toBe(0);
  });

  it('filters by status and project', async () => {
    const user = await makeUser();
    const project = await repo.insertProject(user.id, {
      name: 'Home',
      description: null,
      color: null,
    });

    const a = await productivity.createTask(user.id, {
      title: 'In project',
      priority: 3,
      projectId: project.id,
      repeatInterval: 1,
    });
    await productivity.createTask(user.id, { title: 'Loose', priority: 3, repeatInterval: 1 });
    if (!a.ok) throw new Error('setup failed');
    await productivity.completeTask(user.id, a.value.id);

    expect(await repo.countTasks(user.id, { projectId: project.id })).toBe(1);
    expect(await repo.countTasks(user.id, { status: ['done'] })).toBe(1);
    expect(await repo.countTasks(user.id, { status: ['todo', 'doing'] })).toBe(1);
  });

  it('paginates deterministically', async () => {
    const user = await makeUser();
    for (let i = 0; i < 12; i += 1) {
      await productivity.createTask(user.id, {
        title: `Task ${String(i).padStart(2, '0')}`,
        priority: 3,
        repeatInterval: 1,
      });
    }

    const first = await repo.listTasks(user.id, {
      limit: 5,
      offset: 0,
      sort: 'title',
      direction: 'asc',
    });
    const second = await repo.listTasks(user.id, {
      limit: 5,
      offset: 5,
      sort: 'title',
      direction: 'asc',
    });

    expect(first).toHaveLength(5);
    expect(second).toHaveLength(5);
    // No overlap between pages — a stable sort key guarantees it.
    const overlap = first.filter((a) => second.some((b) => b.id === a.id));
    expect(overlap).toEqual([]);
    expect(await repo.countTasks(user.id)).toBe(12);
  });
});

describe('habits', () => {
  it('logs idempotently, so a double tap counts once', async () => {
    const user = await makeUser();
    const habit = await repo.insertHabit(user.id, {
      name: 'Read',
      description: null,
      cadence: 'daily',
      targetPerPeriod: 1,
      color: null,
    });

    await productivity.logHabit(user.id, { habitId: habit.id, onDate: '2026-09-20', count: 1 });
    await productivity.logHabit(user.id, { habitId: habit.id, onDate: '2026-09-20', count: 1 });

    const entries = await repo.listHabitEntries(user.id, habit.id, '2026-09-01');
    expect(entries).toHaveLength(1);
  });

  it('computes a streak from real entries', async () => {
    const user = await makeUser();
    const habit = await repo.insertHabit(user.id, {
      name: 'Exercise',
      description: null,
      cadence: 'daily',
      targetPerPeriod: 1,
      color: null,
    });

    for (const date of ['2026-09-18', '2026-09-19', '2026-09-20']) {
      await productivity.logHabit(user.id, { habitId: habit.id, onDate: date, count: 1 });
    }

    const withStreaks = await productivity.habitsWithStreaks(user.id, '2026-09-20');
    expect(withStreaks[0]?.streak.current).toBe(3);
    expect(withStreaks[0]?.streak.completedToday).toBe(true);
  });

  it('un-logging shortens the streak', async () => {
    const user = await makeUser();
    const habit = await repo.insertHabit(user.id, {
      name: 'Journal',
      description: null,
      cadence: 'daily',
      targetPerPeriod: 1,
      color: null,
    });

    for (const date of ['2026-09-19', '2026-09-20']) {
      await productivity.logHabit(user.id, { habitId: habit.id, onDate: date, count: 1 });
    }
    await productivity.unlogHabit(user.id, habit.id, '2026-09-20');

    const withStreaks = await productivity.habitsWithStreaks(user.id, '2026-09-20');
    // Yesterday alone still keeps a streak alive; today is simply not done.
    expect(withStreaks[0]?.streak.current).toBe(1);
    expect(withStreaks[0]?.streak.completedToday).toBe(false);
  });

  it('refuses to log against a habit that is not yours', async () => {
    const alice = await makeUser('alice@example.com');
    const bob = await makeUser('bob@example.com');

    const bobHabit = await repo.insertHabit(bob.id, {
      name: 'Bob habit',
      description: null,
      cadence: 'daily',
      targetPerPeriod: 1,
      color: null,
    });

    const result = await productivity.logHabit(alice.id, {
      habitId: bobHabit.id,
      onDate: '2026-09-20',
      count: 1,
    });

    expect(result.ok).toBe(false);
    expect(await repo.listHabitEntries(bob.id, bobHabit.id, '2026-09-01')).toEqual([]);
  });
});

describe('goals', () => {
  it('tracks numeric progress and marks achievement', async () => {
    const user = await makeUser();
    await seedNotificationPreferences(user.id);

    const created = await productivity.createGoal(user.id, {
      title: 'Read 12 books',
      kind: 'numeric',
      targetValue: '12',
      unit: 'books',
      repeatInterval: 1,
    } as never);
    if (!created.ok) throw new Error('setup failed');

    const partial = await productivity.recordCheckpoint(user.id, {
      goalId: created.value.id,
      value: '6',
    });
    expect(partial.ok && partial.value.status).toBe('active');

    const complete = await productivity.recordCheckpoint(user.id, {
      goalId: created.value.id,
      value: '12',
    });
    expect(complete.ok).toBe(true);
    if (!complete.ok) return;
    expect(complete.value.status).toBe('achieved');
    expect(complete.value.achievedAt).not.toBeNull();
  });

  it('keeps every checkpoint as review history', async () => {
    const user = await makeUser();
    const created = await productivity.createGoal(user.id, {
      title: 'Run 100km',
      kind: 'numeric',
      targetValue: '100',
      unit: 'km',
    } as never);
    if (!created.ok) throw new Error('setup failed');

    for (const value of ['10', '25.5', '60']) {
      await productivity.recordCheckpoint(user.id, { goalId: created.value.id, value });
    }

    const history = await repo.listCheckpoints(user.id, created.value.id);
    expect(history).toHaveLength(3);
  });

  it('keeps a financial goal in exact minor units', async () => {
    const user = await makeUser();
    const created = await productivity.createGoal(user.id, {
      title: 'Emergency fund',
      kind: 'financial',
      targetValue: '100000.00',
      currency: 'INR',
    } as never);
    if (!created.ok) throw new Error('setup failed');

    // 100000.00 INR is 10,000,000 paise, exactly.
    expect(created.value.targetValue).toBe('10000000');

    const progress = await productivity.recordCheckpoint(user.id, {
      goalId: created.value.id,
      value: '25000.50',
    });
    expect(progress.ok && progress.value.currentValue).toBe('2500050');
  });

  it('handles fractional numeric values exactly', async () => {
    const user = await makeUser();
    const created = await productivity.createGoal(user.id, {
      title: 'Distance',
      kind: 'numeric',
      targetValue: '42.195',
      unit: 'km',
    } as never);
    if (!created.ok) throw new Error('setup failed');

    const progress = await productivity.recordCheckpoint(user.id, {
      goalId: created.value.id,
      value: '42.195',
    });
    expect(progress.ok && progress.value.status).toBe('achieved');
  });

  it('refuses a checkpoint on a closed goal', async () => {
    const user = await makeUser();
    const created = await productivity.createGoal(user.id, {
      title: 'Done already',
      kind: 'numeric',
      targetValue: '1',
    } as never);
    if (!created.ok) throw new Error('setup failed');

    await productivity.recordCheckpoint(user.id, { goalId: created.value.id, value: '1' });
    const after = await productivity.recordCheckpoint(user.id, {
      goalId: created.value.id,
      value: '2',
    });

    expect(after.ok).toBe(false);
    if (after.ok) return;
    expect(after.error.kind).toBe('conflict');
  });

  it('refuses a checkpoint on another account goal', async () => {
    const alice = await makeUser('alice@example.com');
    const bob = await makeUser('bob@example.com');

    const bobGoal = await productivity.createGoal(bob.id, {
      title: 'Bob goal',
      kind: 'numeric',
      targetValue: '10',
    } as never);
    if (!bobGoal.ok) throw new Error('setup failed');

    const result = await productivity.recordCheckpoint(alice.id, {
      goalId: bobGoal.value.id,
      value: '10',
    });

    expect(result.ok).toBe(false);
    expect(await repo.listCheckpoints(bob.id, bobGoal.value.id)).toEqual([]);
  });

  it('computes off-track against elapsed time', async () => {
    const user = await makeUser();
    const created = await productivity.createGoal(user.id, {
      title: 'Paced',
      kind: 'numeric',
      targetValue: '100',
      startsOn: '2026-09-01',
      targetDate: '2026-09-30',
    } as never);
    if (!created.ok) throw new Error('setup failed');

    await productivity.recordCheckpoint(user.id, { goalId: created.value.id, value: '10' });
    const goal = await repo.findGoal(user.id, created.value.id);

    // 2/3 of the window gone, 10% done.
    const progress = productivity.describeProgress(goal!, '2026-09-20');
    expect(progress.percent).toBe(10);
    expect(progress.offTrack).toBe(true);
    expect(progress.daysRemaining).toBe(10);
  });
});

describe('notifications', () => {
  it('raises, deduplicates, and marks read', async () => {
    const user = await makeUser();
    await seedNotificationPreferences(user.id);

    expect(
      await notify(user.id, {
        kind: 'task_overdue',
        title: 'Something is overdue',
        dedupeKey: 'overdue:2026-09-20',
      }),
    ).toBe(true);

    // The same condition evaluated twice must not notify twice.
    expect(
      await notify(user.id, {
        kind: 'task_overdue',
        title: 'Something is overdue',
        dedupeKey: 'overdue:2026-09-20',
      }),
    ).toBe(false);

    expect(await repo.countUnreadNotifications(user.id)).toBe(1);

    const [notification] = await repo.listNotifications(user.id);
    expect(await repo.markNotificationRead(user.id, notification!.id)).toBe(true);
    expect(await repo.countUnreadNotifications(user.id)).toBe(0);
  });

  it('honours a disabled kind', async () => {
    const user = await makeUser();
    await seedNotificationPreferences(user.id);
    await repo.setNotificationPreference(user.id, 'task_overdue', false);

    expect(await notify(user.id, { kind: 'task_overdue', title: 'Suppressed' })).toBe(false);
    expect(await repo.countUnreadNotifications(user.id)).toBe(0);

    // Other kinds are unaffected.
    expect(await notify(user.id, { kind: 'goal_achieved', title: 'Allowed' })).toBe(true);
  });

  it('refuses an off-origin link target', async () => {
    const user = await makeUser();
    await seedNotificationPreferences(user.id);

    await notify(user.id, {
      kind: 'goal_achieved',
      title: 'Hostile link',
      href: 'https://evil.example/phish',
    });

    const [row] = await repo.listNotifications(user.id);
    // A notification is a link the user is invited to click; an absolute URL
    // here would be an open redirect carrying the product's credibility.
    expect(row?.href).toBeNull();
  });

  it('cannot mark another account notification as read', async () => {
    const alice = await makeUser('alice@example.com');
    const bob = await makeUser('bob@example.com');
    await seedNotificationPreferences(bob.id);

    await notify(bob.id, { kind: 'goal_achieved', title: 'Bob only' });
    const [bobNotification] = await repo.listNotifications(bob.id);

    expect(await repo.markNotificationRead(alice.id, bobNotification!.id)).toBe(false);
    expect(await repo.countUnreadNotifications(bob.id)).toBe(1);
  });
});

describe('productivity isolation', () => {
  it('never returns another account tasks, habits or goals', async () => {
    const alice = await makeUser('alice@example.com');
    const bob = await makeUser('bob@example.com');

    await productivity.createTask(bob.id, {
      title: 'Bob private task',
      priority: 3,
      repeatInterval: 1,
    });
    await repo.insertHabit(bob.id, {
      name: 'Bob habit',
      description: null,
      cadence: 'daily',
      targetPerPeriod: 1,
      color: null,
    });
    await productivity.createGoal(bob.id, {
      title: 'Bob goal',
      kind: 'numeric',
      targetValue: '5',
    } as never);

    expect(await repo.listTasks(alice.id)).toEqual([]);
    expect(await repo.listHabits(alice.id)).toEqual([]);
    expect(await repo.listGoals(alice.id)).toEqual([]);
    expect(await repo.countTasks(alice.id)).toBe(0);

    const counts = await repo.taskCounts(alice.id, '2026-09-20', new Date());
    expect(counts.openTotal).toBe(0);
  });

  it('cannot complete or delete another account task', async () => {
    const alice = await makeUser('alice@example.com');
    const bob = await makeUser('bob@example.com');

    const bobTask = await productivity.createTask(bob.id, {
      title: 'Bob task',
      priority: 3,
      repeatInterval: 1,
    });
    if (!bobTask.ok) throw new Error('setup failed');

    expect((await productivity.completeTask(alice.id, bobTask.value.id)).ok).toBe(false);
    expect((await productivity.deleteTask(alice.id, bobTask.value.id)).ok).toBe(false);

    const still = await repo.findTask(bob.id, bobTask.value.id);
    expect(still?.status).toBe('todo');
  });
});
