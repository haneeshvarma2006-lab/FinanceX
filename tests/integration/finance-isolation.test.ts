import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getPool } from '@/lib/db/client';
import * as identity from '@/modules/identity/service';
import { signUpSchema } from '@/modules/identity/validators';
import * as repo from '@/modules/finance/repository';
import * as finance from '@/modules/finance/service';

/**
 * IDOR coverage for the finance module.
 *
 * Every one of these is an attempt to reach Bob's money using Alice's session
 * and Bob's identifiers. They are the reason `userId` is the first argument of
 * every repository function.
 */

const ctx = { ip: '203.0.113.50', userAgent: 'vitest' };

async function reset() {
  await getPool().query('truncate table users cascade');
  await getPool().query('truncate table rate_limits');
}

async function makeUserWithData(email: string) {
  const result = await identity.signUp(
    signUpSchema.parse({
      email,
      password: 'a sufficiently long passphrase',
      dateOfBirth: '1995-04-12',
      acceptedTerms: true,
      displayName: email.split('@')[0]!,
    }),
    ctx,
  );
  if (!result.ok) throw new Error(`setup failed for ${email}`);
  const user = result.user;

  const account = await repo.insertAccount(user.id, {
    name: 'Main',
    kind: 'bank',
    currency: 'INR',
    openingBalanceMinor: 1000000n,
  });
  const category = await repo.insertCategory(user.id, { name: 'Food', kind: 'expense' });

  const tx = await finance.createTransaction(user.id, {
    accountId: account.id,
    categoryId: category.id,
    occurredOn: '2026-09-01',
    amount: '999.00',
    kind: 'expense',
    description: `${email} private transaction`,
  });
  if (!tx.ok) throw new Error('transaction setup failed');

  return { user, account, category, transaction: tx.value };
}

beforeEach(reset);
afterAll(async () => {
  await reset();
  await getPool().end();
});

describe('reading another account data', () => {
  it('cannot list it', async () => {
    const alice = await makeUserWithData('alice@example.com');
    const bob = await makeUserWithData('bob@example.com');

    const aliceAccounts = await repo.listAccounts(alice.user.id);
    expect(aliceAccounts.map((a) => a.id)).toEqual([alice.account.id]);
    expect(aliceAccounts.map((a) => a.id)).not.toContain(bob.account.id);

    const aliceTx = await repo.listTransactions(alice.user.id);
    expect(aliceTx.every((t) => t.userId === alice.user.id)).toBe(true);
    expect(aliceTx.map((t) => t.description)).not.toContain('bob@example.com private transaction');
  });

  it('cannot fetch it by id', async () => {
    const alice = await makeUserWithData('alice@example.com');
    const bob = await makeUserWithData('bob@example.com');

    expect(await repo.findAccount(alice.user.id, bob.account.id)).toBeUndefined();
    expect(await repo.findCategory(alice.user.id, bob.category.id)).toBeUndefined();
    expect(await repo.findTransaction(alice.user.id, bob.transaction.id)).toBeUndefined();
  });

  it('cannot see it in balances or totals', async () => {
    const alice = await makeUserWithData('alice@example.com');
    const bob = await makeUserWithData('bob@example.com');

    const balances = await repo.accountBalances(alice.user.id);
    expect(balances.has(bob.account.id)).toBe(false);
    expect(balances.size).toBe(1);

    const totals = await repo.periodTotals(alice.user.id, '2026-01-01', '2026-12-31');
    // Alice spent 999; Bob's identical 999 must not appear.
    expect(totals.expenseMinor).toBe(99900n);
  });

  it('cannot read its revision history', async () => {
    const alice = await makeUserWithData('alice@example.com');
    const bob = await makeUserWithData('bob@example.com');

    const revisions = await repo.listRevisions(alice.user.id, 'transaction', bob.transaction.id);
    expect(revisions).toEqual([]);
  });
});

describe('writing into another account', () => {
  it('cannot create a transaction in their account', async () => {
    const alice = await makeUserWithData('alice@example.com');
    const bob = await makeUserWithData('bob@example.com');

    const result = await finance.createTransaction(alice.user.id, {
      accountId: bob.account.id,
      occurredOn: '2026-09-05',
      amount: '50000.00',
      kind: 'expense',
      description: 'Injected',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('not_found');

    // And nothing landed.
    expect(await repo.countTransactions(bob.user.id)).toBe(1);
  });

  it('cannot attach their category to its own transaction', async () => {
    const alice = await makeUserWithData('alice@example.com');
    const bob = await makeUserWithData('bob@example.com');

    const result = await finance.createTransaction(alice.user.id, {
      accountId: alice.account.id,
      categoryId: bob.category.id,
      occurredOn: '2026-09-05',
      amount: '10.00',
      kind: 'expense',
      description: 'Borrowed category',
    });

    expect(result.ok).toBe(false);
  });

  it('cannot update their transaction', async () => {
    const alice = await makeUserWithData('alice@example.com');
    const bob = await makeUserWithData('bob@example.com');

    const result = await finance.updateTransaction(alice.user.id, bob.transaction.id, {
      accountId: alice.account.id,
      occurredOn: '2026-09-05',
      amount: '1.00',
      kind: 'expense',
      description: 'Hijacked',
    });

    expect(result.ok).toBe(false);

    const untouched = await repo.findTransaction(bob.user.id, bob.transaction.id);
    expect(untouched?.description).toBe('bob@example.com private transaction');
  });

  it('cannot delete their transaction', async () => {
    const alice = await makeUserWithData('alice@example.com');
    const bob = await makeUserWithData('bob@example.com');

    const result = await finance.deleteTransaction(alice.user.id, bob.transaction.id);
    expect(result.ok).toBe(false);
    expect(await repo.findTransaction(bob.user.id, bob.transaction.id)).toBeDefined();
  });

  it('cannot transfer out of their account', async () => {
    const alice = await makeUserWithData('alice@example.com');
    const bob = await makeUserWithData('bob@example.com');

    const result = await finance.createTransfer(alice.user.id, {
      fromAccountId: bob.account.id,
      toAccountId: alice.account.id,
      occurredOn: '2026-09-05',
      amount: '10000.00',
      description: 'Drain',
    });

    expect(result.ok).toBe(false);
    expect(await repo.countTransactions(bob.user.id)).toBe(1);
  });

  it('cannot archive their account or category', async () => {
    const alice = await makeUserWithData('alice@example.com');
    const bob = await makeUserWithData('bob@example.com');

    expect(await repo.archiveAccount(alice.user.id, bob.account.id)).toBe(false);
    expect(await repo.archiveCategory(alice.user.id, bob.category.id)).toBe(false);

    const stillThere = await repo.findAccount(bob.user.id, bob.account.id);
    expect(stillThere?.archivedAt).toBeNull();
  });

  it('cannot delete their budget or subscription', async () => {
    const alice = await makeUserWithData('alice@example.com');
    const bob = await makeUserWithData('bob@example.com');

    const budget = await repo.insertBudget(bob.user.id, {
      categoryId: bob.category.id,
      period: 'monthly',
      amountMinor: 100000n,
      currency: 'INR',
      startsOn: '2026-09-01',
    });
    const subscription = await repo.insertSubscription(bob.user.id, {
      name: 'Streaming',
      amountMinor: 49900n,
      currency: 'INR',
      cadence: 'monthly',
      nextDueOn: '2026-10-01',
    });

    expect(await repo.deleteBudget(alice.user.id, budget.id)).toBe(false);
    expect(await repo.deleteSubscription(alice.user.id, subscription.id)).toBe(false);

    expect(await repo.listBudgets(bob.user.id)).toHaveLength(1);
    expect(await repo.listSubscriptions(bob.user.id)).toHaveLength(1);
  });
});

describe('cascade on account deletion', () => {
  it('removes that user financial data and nobody else', async () => {
    const alice = await makeUserWithData('alice@example.com');
    const bob = await makeUserWithData('bob@example.com');

    await getPool().query('delete from users where id = $1', [alice.user.id]);

    expect(await repo.countTransactions(bob.user.id)).toBe(1);
    expect(await repo.listAccounts(bob.user.id)).toHaveLength(1);

    const { rows } = await getPool().query<{ c: string }>(
      'select count(*)::text as c from transactions where user_id = $1',
      [alice.user.id],
    );
    expect(rows[0]?.c).toBe('0');
  });
});
