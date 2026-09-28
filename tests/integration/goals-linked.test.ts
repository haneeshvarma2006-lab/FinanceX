import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getPool } from '@/lib/db/client';
import * as identity from '@/modules/identity/service';
import { signUpSchema } from '@/modules/identity/validators';
import * as financeRepo from '@/modules/finance/repository';
import * as finance from '@/modules/finance/service';
import * as repo from '@/modules/productivity/repository';
import * as productivity from '@/modules/productivity/service';
import { goalSchema, taskSchema } from '@/modules/productivity/validators';
import * as tradingRepo from '@/modules/trading/repository';
import * as trading from '@/modules/trading/service';

/**
 * Goals at the centre: a goal can follow a money account or a trading
 * account by itself, can create the tasks that move it, and tasks can say
 * which goal they serve — all without crossing from one user into another.
 */

const ctx = { ip: '203.0.113.90', userAgent: 'vitest' };

async function reset() {
  await getPool().query('truncate table users cascade');
  await getPool().query('truncate table rate_limits');
}

async function makeUser(email: string) {
  const result = await identity.signUp(
    signUpSchema.parse({
      email,
      password: 'a sufficiently long passphrase',
      dateOfBirth: '1990-01-01',
      acceptedTerms: true,
      displayName: 'Builder',
    }),
    ctx,
  );
  if (!result.ok) throw new Error('setup failed');
  return result.user;
}

beforeEach(reset);
afterAll(async () => {
  await reset();
  await getPool().end();
});

describe('a goal that follows a money account', () => {
  it('tracks the balance as checkpoints and is achieved when it reaches the target', async () => {
    const user = await makeUser('saver@example.com');
    const savings = await financeRepo.insertAccount(user.id, {
      name: 'Emergency fund',
      kind: 'bank',
      currency: 'INR',
      openingBalanceMinor: 5000000n, // ₹50,000
    });

    const created = await productivity.createGoal(
      user.id,
      goalSchema.parse({
        title: 'Build an emergency fund',
        targetValue: '100000',
        source: 'account',
        accountId: savings.id,
      }),
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    // Following an account makes it a money goal in that account's currency.
    expect(created.value.kind).toBe('financial');
    expect(created.value.currency).toBe('INR');

    await productivity.syncLinkedGoals(user.id);
    let goal = await repo.findGoal(user.id, created.value.id);
    expect(goal?.currentValue).toBe('5000000');
    expect(goal?.status).toBe('active');

    await finance.createTransaction(user.id, {
      accountId: savings.id,
      occurredOn: '2026-09-10',
      amount: '60000.00',
      kind: 'income',
      description: 'Bonus',
    });
    await productivity.syncLinkedGoals(user.id);

    goal = await repo.findGoal(user.id, created.value.id);
    expect(goal?.currentValue).toBe('11000000');
    expect(goal?.status).toBe('achieved');
    // Each change is a checkpoint in the history, not an overwrite.
    expect(await repo.listCheckpoints(user.id, created.value.id)).toHaveLength(2);
  });

  it('writes nothing when the balance has not moved', async () => {
    const user = await makeUser('steady@example.com');
    const account = await financeRepo.insertAccount(user.id, {
      name: 'Savings',
      kind: 'bank',
      currency: 'INR',
      openingBalanceMinor: 100000n,
    });
    const created = await productivity.createGoal(
      user.id,
      goalSchema.parse({
        title: 'Save',
        targetValue: '5000',
        source: 'account',
        accountId: account.id,
      }),
    );
    if (!created.ok) throw new Error('goal setup failed');

    await productivity.syncLinkedGoals(user.id);
    await productivity.syncLinkedGoals(user.id);
    expect(await repo.listCheckpoints(user.id, created.value.id)).toHaveLength(1);
  });

  it('refuses to follow somebody else’s account', async () => {
    const alice = await makeUser('alice@example.com');
    const bob = await makeUser('bob@example.com');
    const bobs = await financeRepo.insertAccount(bob.id, {
      name: 'Bob savings',
      kind: 'bank',
      currency: 'INR',
      openingBalanceMinor: 0n,
    });

    const result = await productivity.createGoal(
      alice.id,
      goalSchema.parse({
        title: 'Borrowed',
        targetValue: '10',
        source: 'account',
        accountId: bobs.id,
      }),
    );
    expect(result.ok).toBe(false);
  });
});

describe('a goal that follows a trading account', () => {
  it('counts realised profit from trades closed since the goal started', async () => {
    const user = await makeUser('trader@example.com');
    const account = await tradingRepo.insertTradingAccount(user.id, {
      name: 'Prop challenge',
      broker: 'Manual',
      currency: 'INR',
      startingBalanceMinor: 10000000n,
      riskPerTradeBps: 100,
      environment: 'live',
    });

    const created = await productivity.createGoal(
      user.id,
      goalSchema.parse({
        title: 'Pass the challenge',
        targetValue: '2000',
        source: 'trading',
        tradingAccountId: account.id,
        startsOn: '2026-09-01',
        starterTasks: 'on',
      }),
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    // Starter tasks: the recurring work that moves a trading goal, linked to it.
    const tasks = await repo.listTasks(user.id, { goalIds: [created.value.id], limit: 50 });
    expect(tasks.map((t) => t.title).sort()).toEqual([
      'Journal review',
      'Risk management review',
      'Weekly analysis',
    ]);
    expect(tasks.every((t) => t.rrule && t.goalId === created.value.id)).toBe(true);

    const trade = await trading.createTrade(user.id, {
      tradingAccountId: account.id,
      symbol: 'INFY',
      assetClass: 'equity',
      direction: 'long',
    });
    if (!trade.ok) throw new Error('trade setup failed');
    await trading.addExecution(user.id, trade.value.id, {
      side: 'buy',
      quantity: '100',
      price: '250',
      fee: '0',
      executedAt: '2026-09-01T10:00:00Z',
    });
    await trading.addExecution(user.id, trade.value.id, {
      side: 'sell',
      quantity: '100',
      price: '275',
      fee: '0',
      executedAt: '2026-09-02T10:00:00Z',
    });

    await productivity.syncLinkedGoals(user.id);
    const goal = await repo.findGoal(user.id, created.value.id);
    expect(goal?.currentValue).toBe('250000'); // ₹2,500 realised
    expect(goal?.status).toBe('achieved');
  });
});

describe('tasks that serve a goal', () => {
  it('links a task to one of your goals, and keeps the link on the next repeat', async () => {
    const user = await makeUser('linker@example.com');
    const goal = await productivity.createGoal(
      user.id,
      goalSchema.parse({ title: 'Read 12 books', targetValue: '12', unit: 'books' }),
    );
    if (!goal.ok) throw new Error('goal setup failed');

    const task = await productivity.createTask(
      user.id,
      taskSchema.parse({ title: 'Read 30 pages', goalId: goal.value.id, repeat: 'daily' }),
    );
    expect(task.ok && task.value.goalId).toBe(goal.value.id);
    if (!task.ok) return;

    const done = await productivity.completeTask(user.id, task.value.id);
    expect(done.ok && done.value.nextOccurrence?.goalId).toBe(goal.value.id);
  });

  it('refuses to link a task to somebody else’s goal', async () => {
    const alice = await makeUser('alice2@example.com');
    const bob = await makeUser('bob2@example.com');
    const bobsGoal = await productivity.createGoal(
      bob.id,
      goalSchema.parse({ title: 'Bob goal', targetValue: '1', kind: 'milestone' }),
    );
    if (!bobsGoal.ok) throw new Error('goal setup failed');

    const result = await productivity.createTask(
      alice.id,
      taskSchema.parse({ title: 'Sneaky', goalId: bobsGoal.value.id }),
    );
    expect(result.ok).toBe(false);
  });
});
