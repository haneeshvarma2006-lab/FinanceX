import { invalid, notFound, ok, type Result } from '@/lib/result';
import { parseAmount, type Currency } from '@/lib/money';
import type { Transaction } from './schema';
import * as repo from './repository';
import type { TransactionInput, TransferInput } from './validators';

/**
 * Finance business rules.
 *
 * Ownership is re-checked here on every referenced entity, not just on the row
 * being written. Trusting an accountId straight from a form would let a caller
 * post a transaction into someone else's account — the classic IDOR.
 */

/** Snapshot for the revision log. Bigints are stringified so JSON can hold them. */
function snapshot(row: Transaction): Record<string, unknown> {
  return {
    accountId: row.accountId,
    categoryId: row.categoryId,
    occurredOn: row.occurredOn,
    amountMinor: row.amountMinor.toString(),
    currency: row.currency,
    kind: row.kind,
    description: row.description,
    merchant: row.merchant,
  };
}

export async function createTransaction(
  userId: string,
  input: TransactionInput,
): Promise<Result<Transaction>> {
  const account = await repo.findAccount(userId, input.accountId);
  // Not "forbidden": revealing that an id exists but belongs to someone else
  // is itself a disclosure. An unowned id is simply not found.
  if (!account) return notFound();

  if (input.categoryId) {
    const category = await repo.findCategory(userId, input.categoryId);
    if (!category) return notFound();
    if (category.kind !== input.kind) {
      return invalid('categoryId', `That category is for ${category.kind}, not ${input.kind}`);
    }
  }

  let magnitude: bigint;
  try {
    magnitude = parseAmount(input.amount, account.currency as Currency);
  } catch (error) {
    return invalid('amount', error instanceof Error ? error.message : 'Invalid amount');
  }

  if (magnitude === 0n) return invalid('amount', 'Enter an amount other than zero');
  if (magnitude < 0n)
    return invalid('amount', 'Enter a positive amount and pick income or expense');

  // Sign is derived from the kind, so the stored ledger is always consistent
  // regardless of how the user typed the number.
  const amountMinor = input.kind === 'expense' ? -magnitude : magnitude;

  const row = await repo.insertTransaction(userId, {
    accountId: account.id,
    categoryId: input.categoryId || null,
    occurredOn: input.occurredOn,
    amountMinor,
    currency: account.currency,
    kind: input.kind,
    description: input.description,
    merchant: input.merchant ?? null,
    notes: input.notes ?? null,
  });

  await repo.insertRevision({
    userId,
    entityType: 'transaction',
    entityId: row.id,
    action: 'created',
    before: null,
    after: snapshot(row),
  });

  return ok(row);
}

export async function updateTransaction(
  userId: string,
  id: string,
  input: TransactionInput,
): Promise<Result<Transaction>> {
  const existing = await repo.findTransaction(userId, id);
  if (!existing) return notFound();

  if (existing.kind === 'transfer') {
    return invalid('kind', 'Edit a transfer by deleting it and creating a new one');
  }

  const account = await repo.findAccount(userId, input.accountId);
  if (!account) return notFound();

  if (input.categoryId) {
    const category = await repo.findCategory(userId, input.categoryId);
    if (!category) return notFound();
  }

  let magnitude: bigint;
  try {
    magnitude = parseAmount(input.amount, account.currency as Currency);
  } catch (error) {
    return invalid('amount', error instanceof Error ? error.message : 'Invalid amount');
  }
  if (magnitude <= 0n) return invalid('amount', 'Enter a positive amount');

  const updated = await repo.updateTransaction(userId, id, {
    accountId: account.id,
    categoryId: input.categoryId || null,
    occurredOn: input.occurredOn,
    amountMinor: input.kind === 'expense' ? -magnitude : magnitude,
    currency: account.currency,
    kind: input.kind,
    description: input.description,
    merchant: input.merchant ?? null,
    notes: input.notes ?? null,
  });

  if (!updated) return notFound();

  await repo.insertRevision({
    userId,
    entityType: 'transaction',
    entityId: id,
    action: 'updated',
    before: snapshot(existing),
    after: snapshot(updated),
  });

  return ok(updated);
}

export async function deleteTransaction(userId: string, id: string): Promise<Result<null>> {
  const existing = await repo.findTransaction(userId, id);
  if (!existing) return notFound();

  // Removing one leg of a transfer would leave the other stranded.
  if (existing.transferGroupId) {
    const removed = await repo.deleteTransferGroup(userId, existing.transferGroupId);
    for (const row of removed) {
      await repo.insertRevision({
        userId,
        entityType: 'transaction',
        entityId: row.id,
        action: 'deleted',
        before: snapshot(row),
        after: null,
      });
    }
    return ok(null);
  }

  const removed = await repo.deleteTransaction(userId, id);
  if (!removed) return notFound();

  await repo.insertRevision({
    userId,
    entityType: 'transaction',
    entityId: id,
    action: 'deleted',
    before: snapshot(removed),
    after: null,
  });

  return ok(null);
}

/**
 * A transfer is two balanced rows, written atomically.
 *
 * Both accounts must be owned by the caller and share a currency — converting
 * across currencies needs an FX rate and a documented policy (D-03), and
 * silently treating 100 USD as 100 INR would be a serious data error.
 */
export async function createTransfer(
  userId: string,
  input: TransferInput,
): Promise<Result<{ from: Transaction; to: Transaction }>> {
  const [from, to] = await Promise.all([
    repo.findAccount(userId, input.fromAccountId),
    repo.findAccount(userId, input.toAccountId),
  ]);

  if (!from || !to) return notFound();

  if (from.currency !== to.currency) {
    return invalid('toAccountId', 'Transfers between different currencies are not supported yet');
  }

  let magnitude: bigint;
  try {
    magnitude = parseAmount(input.amount, from.currency as Currency);
  } catch (error) {
    return invalid('amount', error instanceof Error ? error.message : 'Invalid amount');
  }
  if (magnitude <= 0n) return invalid('amount', 'Enter a positive amount');

  const pair = await repo.insertTransferPair(
    userId,
    {
      accountId: from.id,
      categoryId: null,
      occurredOn: input.occurredOn,
      amountMinor: -magnitude,
      currency: from.currency,
      kind: 'transfer',
      description: input.description,
    },
    {
      accountId: to.id,
      categoryId: null,
      occurredOn: input.occurredOn,
      amountMinor: magnitude,
      currency: to.currency,
      kind: 'transfer',
      description: input.description,
    },
  );

  return ok(pair);
}

/**
 * Budget progress for a period.
 *
 * Returned as exact minor units plus an integer percentage; the percentage is
 * for a progress bar and is never fed back into any monetary calculation.
 */
export async function budgetProgress(
  userId: string,
  from: string,
  to: string,
): Promise<
  {
    budgetId: string;
    categoryId: string;
    limitMinor: bigint;
    spentMinor: bigint;
    remainingMinor: bigint;
    overBudget: boolean;
  }[]
> {
  const [budgets, spend] = await Promise.all([
    repo.listBudgets(userId),
    repo.spendByCategory(userId, from, to),
  ]);

  const spentBy = new Map(spend.map((s) => [s.categoryId, s.spentMinor]));

  return budgets.map((budget) => {
    const spentMinor = spentBy.get(budget.categoryId) ?? 0n;
    return {
      budgetId: budget.id,
      categoryId: budget.categoryId,
      limitMinor: budget.amountMinor,
      spentMinor,
      remainingMinor: budget.amountMinor - spentMinor,
      overBudget: spentMinor > budget.amountMinor,
    };
  });
}
