import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '@/lib/db/client';
import * as identity from '@/modules/identity/service';
import { signUpSchema } from '@/modules/identity/validators';
import * as productivity from '@/modules/productivity/service';
import * as productivityRepo from '@/modules/productivity/repository';
import { buildTodaySnapshot } from '@/modules/dashboard/service';
import * as engine from '@/modules/rules/engine';
import * as repo from '@/modules/rules/repository';
import { STARTER_RULES } from '@/modules/rules/defaults';
import { TRIGGER_TYPES } from '@/modules/rules/triggers';

const ctx = { ip: '203.0.113.90', userAgent: 'vitest' };

async function reset() {
  await pool.query('truncate table users cascade');
  await pool.query('truncate table rate_limits');
}

async function makeUser(email = 'rules@example.com') {
  const result = await identity.signUp(
    signUpSchema.parse({
      email,
      password: 'a sufficiently long passphrase',
      dateOfBirth: '1990-01-01',
      acceptedTerms: true,
      displayName: 'Rules',
    }),
    ctx,
  );
  if (!result.ok) throw new Error('setup failed');
  return result.user;
}

function snapshotFor(user: { id: string; timezone: string; baseCurrency: string }) {
  return buildTodaySnapshot(user.id, user.timezone, user.baseCurrency);
}

beforeEach(reset);
afterAll(async () => {
  await reset();
  await pool.end();
});

describe('starter rules', () => {
  it('are seeded at signup as editable rows, not hardcoded conditions', async () => {
    const user = await makeUser();
    const rules = await repo.listRules(user.id);

    expect(rules).toHaveLength(STARTER_RULES.length);
    expect(rules.every((r) => r.enabled)).toBe(true);
    // Every one is a row the user owns and can change.
    expect(rules.every((r) => r.userId === user.id)).toBe(true);
  });

  it('re-seeding cannot duplicate them', async () => {
    const user = await makeUser();
    const { seedStarterRules } = await import('@/modules/rules/defaults');
    await seedStarterRules(user.id);

    expect(await repo.listRules(user.id)).toHaveLength(STARTER_RULES.length);
  });

  it('every starter rule names a trigger the catalogue knows', async () => {
    for (const rule of STARTER_RULES) {
      expect(TRIGGER_TYPES).toContain(rule.triggerType);
    }
  });
});

describe('evaluation', () => {
  it('records a miss, with a reason, when nothing matches', async () => {
    const user = await makeUser();
    const outcomes = await engine.evaluateAll(user.id, await snapshotFor(user));

    expect(outcomes).toHaveLength(STARTER_RULES.length);
    expect(outcomes.every((o) => o.status === 'not_matched')).toBe(true);

    // A rule that quietly does nothing must be distinguishable from a broken one.
    const runs = await repo.listRuns(user.id);
    expect(runs).toHaveLength(STARTER_RULES.length);
    expect(runs.every((r) => r.reason.length > 0)).toBe(true);
  });

  it('fires when the condition is met and notifies', async () => {
    const user = await makeUser();

    const task = await productivity.createTask(user.id, {
      title: 'Already late',
      priority: 3,
      dueAt: '2020-01-01T09:00:00Z',
      repeatInterval: 1,
    });
    expect(task.ok).toBe(true);

    const outcomes = await engine.evaluateAll(user.id, await snapshotFor(user));
    const overdue = outcomes.find((o) => o.ruleName === 'Overdue work');

    expect(overdue?.status).toBe('fired');

    const notifications = await productivityRepo.listNotifications(user.id);
    expect(notifications.some((n) => n.title === 'You have overdue tasks')).toBe(true);
  });

  it('is idempotent across repeated evaluations on the same day', async () => {
    const user = await makeUser();
    await productivity.createTask(user.id, {
      title: 'Already late',
      priority: 3,
      dueAt: '2020-01-01T09:00:00Z',
      repeatInterval: 1,
    });

    // The dashboard evaluates on every load, so this must not accumulate.
    for (let i = 0; i < 4; i += 1) {
      await engine.evaluateAll(user.id, await snapshotFor(user));
    }

    const notifications = await productivityRepo.listNotifications(user.id);
    expect(notifications.filter((n) => n.title === 'You have overdue tasks')).toHaveLength(1);

    // And the repeats are recorded as suppressed, not as failures.
    const runs = await repo.listRuns(user.id, { limit: 200 });
    const overdueRuns = runs.filter((r) => r.status === 'fired' || r.status === 'suppressed');
    expect(overdueRuns.filter((r) => r.status === 'fired')).toHaveLength(1);
    expect(overdueRuns.filter((r) => r.status === 'suppressed').length).toBeGreaterThan(0);
  });

  it('a disabled rule is never evaluated', async () => {
    const user = await makeUser();
    await productivity.createTask(user.id, {
      title: 'Already late',
      priority: 3,
      dueAt: '2020-01-01T09:00:00Z',
      repeatInterval: 1,
    });

    const rules = await repo.listRules(user.id);
    const overdueRule = rules.find((r) => r.name === 'Overdue work')!;
    await engine.setEnabled(user.id, overdueRule.id, false);

    const outcomes = await engine.evaluateAll(user.id, await snapshotFor(user));

    expect(outcomes.find((o) => o.ruleId === overdueRule.id)).toBeUndefined();
    const notifications = await productivityRepo.listNotifications(user.id);
    expect(notifications.some((n) => n.title === 'You have overdue tasks')).toBe(false);
  });

  it('creates a task when that is the action, exactly once', async () => {
    const user = await makeUser();

    const created = await engine.createRule(user.id, {
      name: 'Nudge me',
      triggerType: 'tasks_overdue',
      triggerConfig: { count: 1 },
      actionType: 'create_task',
      actionConfig: { title: 'Triage the overdue list', priority: 2, schedule: 'today' },
    });
    expect(created.ok).toBe(true);

    await productivity.createTask(user.id, {
      title: 'Already late',
      priority: 3,
      dueAt: '2020-01-01T09:00:00Z',
      repeatInterval: 1,
    });

    await engine.evaluateAll(user.id, await snapshotFor(user));
    await engine.evaluateAll(user.id, await snapshotFor(user));

    const tasks = await productivityRepo.listTasks(user.id, { limit: 50 });
    // Tasks have no unique constraint to absorb a duplicate, so the engine
    // checks its own run log before acting again.
    expect(tasks.filter((t) => t.title === 'Triage the overdue list')).toHaveLength(1);
  });

  it('records an error for a rule whose config no longer validates', async () => {
    const user = await makeUser();

    // Simulate a stored rule whose config is no longer acceptable.
    await pool.query(
      `update automation_rules set trigger_config = '{"count": -5}'::jsonb where name = 'Overdue work' and user_id = $1`,
      [user.id],
    );

    const outcomes = await engine.evaluateAll(user.id, await snapshotFor(user));
    const broken = outcomes.find((o) => o.ruleName === 'Overdue work');

    expect(broken?.status).toBe('error');
    expect(broken?.reason).toMatch(/no longer valid/i);
  });

  it('records an error for an unknown trigger type', async () => {
    const user = await makeUser();
    await pool.query(
      `update automation_rules set trigger_type = 'does_not_exist' where name = 'Overdue work' and user_id = $1`,
      [user.id],
    );

    const outcomes = await engine.evaluateAll(user.id, await snapshotFor(user));
    expect(outcomes.find((o) => o.ruleName === 'Overdue work')?.status).toBe('error');
  });
});

describe('thresholds', () => {
  it('respects a higher threshold', async () => {
    const user = await makeUser();

    const rules = await repo.listRules(user.id);
    const overdueRule = rules.find((r) => r.name === 'Overdue work')!;
    await pool.query(
      `update automation_rules set trigger_config = '{"count": 3}'::jsonb where id = $1`,
      [overdueRule.id],
    );

    await productivity.createTask(user.id, {
      title: 'Late one',
      priority: 3,
      dueAt: '2020-01-01T09:00:00Z',
      repeatInterval: 1,
    });

    let outcomes = await engine.evaluateAll(user.id, await snapshotFor(user));
    expect(outcomes.find((o) => o.ruleName === 'Overdue work')?.status).toBe('not_matched');

    for (const title of ['Late two', 'Late three']) {
      await productivity.createTask(user.id, {
        title,
        priority: 3,
        dueAt: '2020-01-01T09:00:00Z',
        repeatInterval: 1,
      });
    }

    outcomes = await engine.evaluateAll(user.id, await snapshotFor(user));
    expect(outcomes.find((o) => o.ruleName === 'Overdue work')?.status).toBe('fired');
  });

  it('compares a money threshold in exact minor units', async () => {
    const user = await makeUser();

    const financeRepo = await import('@/modules/finance/repository');
    const finance = await import('@/modules/finance/service');

    const account = await financeRepo.insertAccount(user.id, {
      name: 'Current',
      kind: 'bank',
      currency: 'INR',
      openingBalanceMinor: 0n,
    });

    const created = await engine.createRule(user.id, {
      name: 'Spending watch',
      triggerType: 'spent_more_than',
      triggerConfig: { amount: '1000.00' },
      actionType: 'notify',
      actionConfig: { title: 'Spending is up' },
    });
    expect(created.ok).toBe(true);

    const today = new Date().toISOString().slice(0, 10);

    // Exactly at the threshold must NOT fire — the rule says "more than".
    await finance.createTransaction(user.id, {
      accountId: account.id,
      occurredOn: today,
      amount: '1000.00',
      kind: 'expense',
      description: 'Exactly at the line',
    });

    let outcomes = await engine.evaluateAll(user.id, await snapshotFor(user));
    expect(outcomes.find((o) => o.ruleName === 'Spending watch')?.status).toBe('not_matched');

    // One paisa over must fire. A float comparison could get this wrong.
    await finance.createTransaction(user.id, {
      accountId: account.id,
      occurredOn: today,
      amount: '0.01',
      kind: 'expense',
      description: 'One paisa over',
    });

    outcomes = await engine.evaluateAll(user.id, await snapshotFor(user));
    expect(outcomes.find((o) => o.ruleName === 'Spending watch')?.status).toBe('fired');
  });

  it('handles an invalid stored amount without throwing', async () => {
    const user = await makeUser();
    await engine.createRule(user.id, {
      name: 'Bad amount',
      triggerType: 'spent_more_than',
      triggerConfig: { amount: 'not-a-number' },
      actionType: 'notify',
      actionConfig: { title: 'x' },
    });

    const outcomes = await engine.evaluateAll(user.id, await snapshotFor(user));
    const bad = outcomes.find((o) => o.ruleName === 'Bad amount');
    expect(bad?.status).toBe('not_matched');
    expect(bad?.reason).toMatch(/not a valid amount/i);
  });
});

describe('authoring', () => {
  it('rejects an unknown trigger or action', async () => {
    const user = await makeUser();

    expect(
      (
        await engine.createRule(user.id, {
          name: 'Bogus',
          triggerType: 'evil_trigger',
          triggerConfig: {},
          actionType: 'notify',
          actionConfig: { title: 'x' },
        })
      ).ok,
    ).toBe(false);

    expect(
      (
        await engine.createRule(user.id, {
          name: 'Bogus 2',
          triggerType: 'tasks_overdue',
          triggerConfig: { count: 1 },
          actionType: 'run_arbitrary_code',
          actionConfig: {},
        })
      ).ok,
    ).toBe(false);
  });

  it('rejects a config that fails validation', async () => {
    const user = await makeUser();

    const result = await engine.createRule(user.id, {
      name: 'Empty title',
      triggerType: 'tasks_overdue',
      triggerConfig: { count: 1 },
      actionType: 'notify',
      actionConfig: { title: '' },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.field).toBe('actionConfig');
  });

  it('refuses a duplicate name', async () => {
    const user = await makeUser();
    const result = await engine.createRule(user.id, {
      name: 'Overdue work',
      triggerType: 'tasks_overdue',
      triggerConfig: { count: 1 },
      actionType: 'notify',
      actionConfig: { title: 'x' },
    });

    expect(result.ok).toBe(false);
  });

  it('previews without acting', async () => {
    const user = await makeUser();
    await productivity.createTask(user.id, {
      title: 'Already late',
      priority: 3,
      dueAt: '2020-01-01T09:00:00Z',
      repeatInterval: 1,
    });

    const rules = await repo.listRules(user.id);
    const rule = rules.find((r) => r.name === 'Overdue work')!;

    const preview = await engine.previewRule(user.id, rule.id, await snapshotFor(user));
    expect(preview.ok && preview.value.matched).toBe(true);

    // A preview must not notify — it is a check, not a run.
    expect(await productivityRepo.listNotifications(user.id)).toEqual([]);
  });
});

describe('rules isolation', () => {
  it('never exposes or alters another account rules or runs', async () => {
    const alice = await makeUser('alice@example.com');
    const bob = await makeUser('bob@example.com');

    const aliceRules = await repo.listRules(alice.id);
    expect(aliceRules.every((r) => r.userId === alice.id)).toBe(true);

    const bobRule = (await repo.listRules(bob.id))[0]!;

    expect(await repo.findRule(alice.id, bobRule.id)).toBeUndefined();
    expect((await engine.setEnabled(alice.id, bobRule.id, false)).ok).toBe(false);
    expect((await engine.removeRule(alice.id, bobRule.id)).ok).toBe(false);
    expect((await engine.previewRule(alice.id, bobRule.id, await snapshotFor(alice))).ok).toBe(
      false,
    );

    // Bob's rule is untouched.
    const stillThere = await repo.findRule(bob.id, bobRule.id);
    expect(stillThere?.enabled).toBe(true);
  });

  it('evaluates only the caller own rules', async () => {
    const alice = await makeUser('alice@example.com');
    const bob = await makeUser('bob@example.com');

    await productivity.createTask(bob.id, {
      title: 'Bob is late',
      priority: 3,
      dueAt: '2020-01-01T09:00:00Z',
      repeatInterval: 1,
    });

    // Alice has no overdue work, so her rules must not fire on Bob's data.
    const outcomes = await engine.evaluateAll(alice.id, await snapshotFor(alice));
    expect(outcomes.every((o) => o.status === 'not_matched')).toBe(true);
    expect(await productivityRepo.listNotifications(alice.id)).toEqual([]);
  });

  it('scopes the run log to its owner', async () => {
    const alice = await makeUser('alice@example.com');
    const bob = await makeUser('bob@example.com');

    await engine.evaluateAll(bob.id, await snapshotFor(bob));

    expect(await repo.listRuns(alice.id)).toEqual([]);
    expect((await repo.listRuns(bob.id)).length).toBeGreaterThan(0);
  });
});

describe('run log growth', () => {
  it('can be pruned to a bounded size per rule', async () => {
    const user = await makeUser();

    for (let i = 0; i < 8; i += 1) {
      await engine.evaluateAll(user.id, await snapshotFor(user));
    }

    const before = await repo.listRuns(user.id, { limit: 200 });
    expect(before.length).toBe(STARTER_RULES.length * 8);

    await repo.pruneRuns(user.id, 3);

    const after = await repo.listRuns(user.id, { limit: 200 });
    expect(after.length).toBe(STARTER_RULES.length * 3);
  });
});
