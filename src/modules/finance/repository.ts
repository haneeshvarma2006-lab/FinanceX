import { and, asc, desc, eq, gte, isNull, lte, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { newId } from '@/lib/db/id';
import {
  accounts,
  budgets,
  categories,
  netWorthSnapshots,
  recordRevisions,
  subscriptions,
  transactions,
  type Account,
  type Budget,
  type Category,
  type Subscription,
  type Transaction,
} from './schema';

/**
 * Every function takes `userId` first and filters on it. That is the entire
 * tenancy boundary for finance — there is no other place it is enforced, and
 * no query in this module omits it.
 */

/* ------------------------------------------------------------ accounts --- */

export async function listAccounts(userId: string, includeArchived = false): Promise<Account[]> {
  return db
    .select()
    .from(accounts)
    .where(
      includeArchived
        ? eq(accounts.userId, userId)
        : and(eq(accounts.userId, userId), isNull(accounts.archivedAt)),
    )
    .orderBy(asc(accounts.name));
}

export async function findAccount(userId: string, id: string): Promise<Account | undefined> {
  const [row] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.userId, userId)))
    .limit(1);

  return row;
}

export async function insertAccount(
  userId: string,
  input: { name: string; kind: string; currency: string; openingBalanceMinor: bigint },
): Promise<Account> {
  const [row] = await db
    .insert(accounts)
    .values({ userId, ...input })
    .returning();

  if (!row) throw new Error('Account insert returned no row');
  return row;
}

export async function updateAccount(
  userId: string,
  id: string,
  input: { name: string; kind: string; openingBalanceMinor: bigint },
): Promise<Account | undefined> {
  const [row] = await db
    .update(accounts)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(accounts.id, id), eq(accounts.userId, userId)))
    .returning();

  return row;
}

export async function archiveAccount(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .update(accounts)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(accounts.id, id), eq(accounts.userId, userId)))
    .returning({ id: accounts.id });

  return rows.length > 0;
}

/**
 * Balances derived from the ledger, never a stored mutable column.
 *
 * A `balance` field that is incremented on write drifts out of sync with its
 * own transactions the first time anything fails halfway; deriving it means
 * the two can never disagree.
 */
export async function accountBalances(userId: string): Promise<Map<string, bigint>> {
  const rows = await db
    .select({
      accountId: accounts.id,
      balance: sql<string>`(
        ${accounts.openingBalanceMinor}
        + coalesce(sum(${transactions.amountMinor}) filter (where ${transactions.id} is not null), 0)
      )::text`,
    })
    .from(accounts)
    .leftJoin(transactions, eq(transactions.accountId, accounts.id))
    .where(eq(accounts.userId, userId))
    .groupBy(accounts.id, accounts.openingBalanceMinor);

  return new Map(rows.map((r) => [r.accountId, BigInt(r.balance)]));
}

/* ---------------------------------------------------------- categories --- */

export async function listCategories(userId: string): Promise<Category[]> {
  return db
    .select()
    .from(categories)
    .where(and(eq(categories.userId, userId), isNull(categories.archivedAt)))
    .orderBy(asc(categories.name));
}

export async function findCategory(userId: string, id: string): Promise<Category | undefined> {
  const [row] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.userId, userId)))
    .limit(1);

  return row;
}

export async function insertCategory(
  userId: string,
  input: { name: string; kind: string; color?: string | null; icon?: string | null },
): Promise<Category> {
  const [row] = await db
    .insert(categories)
    .values({
      userId,
      name: input.name,
      kind: input.kind,
      color: input.color ?? null,
      icon: input.icon ?? null,
    })
    .returning();

  if (!row) throw new Error('Category insert returned no row');
  return row;
}

export async function archiveCategory(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .update(categories)
    .set({ archivedAt: new Date() })
    .where(and(eq(categories.id, id), eq(categories.userId, userId)))
    .returning({ id: categories.id });

  return rows.length > 0;
}

/* -------------------------------------------------------- transactions --- */

export type TransactionFilter = {
  accountId?: string;
  categoryId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

export async function listTransactions(
  userId: string,
  filter: TransactionFilter = {},
): Promise<Transaction[]> {
  const conditions = [eq(transactions.userId, userId)];

  if (filter.accountId) conditions.push(eq(transactions.accountId, filter.accountId));
  if (filter.categoryId) conditions.push(eq(transactions.categoryId, filter.categoryId));
  if (filter.from) conditions.push(gte(transactions.occurredOn, filter.from));
  if (filter.to) conditions.push(lte(transactions.occurredOn, filter.to));

  return (
    db
      .select()
      .from(transactions)
      .where(and(...conditions))
      .orderBy(desc(transactions.occurredOn), desc(transactions.createdAt))
      // Bounded by default: an unbounded list is a denial-of-service on our own
      // server the moment an account has years of history.
      .limit(Math.min(filter.limit ?? 100, 500))
      .offset(filter.offset ?? 0)
  );
}

export async function countTransactions(
  userId: string,
  filter: TransactionFilter = {},
): Promise<number> {
  const conditions = [eq(transactions.userId, userId)];
  if (filter.accountId) conditions.push(eq(transactions.accountId, filter.accountId));
  if (filter.categoryId) conditions.push(eq(transactions.categoryId, filter.categoryId));
  if (filter.from) conditions.push(gte(transactions.occurredOn, filter.from));
  if (filter.to) conditions.push(lte(transactions.occurredOn, filter.to));

  const [row] = await db
    .select({ count: sql<string>`count(*)::text` })
    .from(transactions)
    .where(and(...conditions));

  return Number(row?.count ?? 0);
}

export async function findTransaction(
  userId: string,
  id: string,
): Promise<Transaction | undefined> {
  const [row] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
    .limit(1);

  return row;
}

export type NewTransaction = {
  accountId: string;
  categoryId: string | null;
  occurredOn: string;
  amountMinor: bigint;
  currency: string;
  kind: string;
  description: string;
  merchant?: string | null;
  notes?: string | null;
  externalId?: string | null;
  transferGroupId?: string | null;
};

export async function insertTransaction(
  userId: string,
  input: NewTransaction,
): Promise<Transaction> {
  const [row] = await db
    .insert(transactions)
    .values({
      userId,
      ...input,
      merchant: input.merchant ?? null,
      notes: input.notes ?? null,
      externalId: input.externalId ?? null,
      transferGroupId: input.transferGroupId ?? null,
    })
    .returning();

  if (!row) throw new Error('Transaction insert returned no row');
  return row;
}

/**
 * Insert a matched pair inside one transaction.
 *
 * Both legs commit or neither does. A half-written transfer would leave the
 * ledger permanently unbalanced, which no later repair could detect reliably.
 */
export async function insertTransferPair(
  userId: string,
  from: NewTransaction,
  to: NewTransaction,
): Promise<{ from: Transaction; to: Transaction }> {
  const groupId = newId();

  return db.transaction(async (tx) => {
    const [a] = await tx
      .insert(transactions)
      .values({ userId, ...from, transferGroupId: groupId, kind: 'transfer' })
      .returning();
    const [b] = await tx
      .insert(transactions)
      .values({ userId, ...to, transferGroupId: groupId, kind: 'transfer' })
      .returning();

    if (!a || !b) throw new Error('Transfer insert returned no rows');
    return { from: a, to: b };
  });
}

export async function updateTransaction(
  userId: string,
  id: string,
  input: Partial<NewTransaction>,
): Promise<Transaction | undefined> {
  const [row] = await db
    .update(transactions)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
    .returning();

  return row;
}

export async function deleteTransaction(
  userId: string,
  id: string,
): Promise<Transaction | undefined> {
  const [row] = await db
    .delete(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
    .returning();

  return row;
}

/** Deleting one leg of a transfer must remove both, or the ledger unbalances. */
export async function deleteTransferGroup(userId: string, groupId: string): Promise<Transaction[]> {
  return db
    .delete(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.transferGroupId, groupId)))
    .returning();
}

/* ----------------------------------------------------------- reporting --- */

/**
 * Income and expense totals for a period.
 *
 * Transfers are excluded explicitly. Without that filter, moving ₹10,000 from
 * savings to current would report ₹10,000 of income AND ₹10,000 of expense.
 */
export async function periodTotals(
  userId: string,
  from: string,
  to: string,
): Promise<{ incomeMinor: bigint; expenseMinor: bigint }> {
  const [row] = await db
    .select({
      income: sql<string>`coalesce(sum(${transactions.amountMinor}) filter (where ${transactions.kind} = 'income'), 0)::text`,
      expense: sql<string>`coalesce(sum(${transactions.amountMinor}) filter (where ${transactions.kind} = 'expense'), 0)::text`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        gte(transactions.occurredOn, from),
        lte(transactions.occurredOn, to),
        ne(transactions.kind, 'transfer'),
      ),
    );

  return {
    incomeMinor: BigInt(row?.income ?? '0'),
    // Expenses are stored negative; report them as a positive magnitude.
    expenseMinor: -BigInt(row?.expense ?? '0'),
  };
}

export async function spendByCategory(
  userId: string,
  from: string,
  to: string,
): Promise<{ categoryId: string | null; spentMinor: bigint }[]> {
  const rows = await db
    .select({
      categoryId: transactions.categoryId,
      spent: sql<string>`(-sum(${transactions.amountMinor}))::text`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.kind, 'expense'),
        gte(transactions.occurredOn, from),
        lte(transactions.occurredOn, to),
      ),
    )
    .groupBy(transactions.categoryId);

  return rows.map((r) => ({ categoryId: r.categoryId, spentMinor: BigInt(r.spent) }));
}

/* ------------------------------------------------------------- budgets --- */

export async function listBudgets(userId: string): Promise<Budget[]> {
  return db.select().from(budgets).where(eq(budgets.userId, userId));
}

export async function insertBudget(
  userId: string,
  input: {
    categoryId: string;
    period: string;
    amountMinor: bigint;
    currency: string;
    startsOn: string;
  },
): Promise<Budget> {
  const [row] = await db
    .insert(budgets)
    .values({ userId, ...input })
    .returning();

  if (!row) throw new Error('Budget insert returned no row');
  return row;
}

export async function deleteBudget(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(budgets)
    .where(and(eq(budgets.id, id), eq(budgets.userId, userId)))
    .returning({ id: budgets.id });

  return rows.length > 0;
}

/* ------------------------------------------------------- subscriptions --- */

export async function listSubscriptions(userId: string): Promise<Subscription[]> {
  return db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .orderBy(asc(subscriptions.nextDueOn));
}

export async function insertSubscription(
  userId: string,
  input: {
    name: string;
    amountMinor: bigint;
    currency: string;
    cadence: string;
    nextDueOn: string;
    accountId?: string | null;
    categoryId?: string | null;
  },
): Promise<Subscription> {
  const [row] = await db
    .insert(subscriptions)
    .values({
      userId,
      ...input,
      accountId: input.accountId ?? null,
      categoryId: input.categoryId ?? null,
    })
    .returning();

  if (!row) throw new Error('Subscription insert returned no row');
  return row;
}

export async function deleteSubscription(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(subscriptions)
    .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, userId)))
    .returning({ id: subscriptions.id });

  return rows.length > 0;
}

/* --------------------------------------------------------- net worth --- */

export async function upsertNetWorthSnapshot(
  userId: string,
  input: { onDate: string; assetsMinor: bigint; liabilitiesMinor: bigint; currency: string },
): Promise<void> {
  await db
    .insert(netWorthSnapshots)
    .values({ userId, ...input })
    .onConflictDoUpdate({
      target: [netWorthSnapshots.userId, netWorthSnapshots.onDate],
      set: { assetsMinor: input.assetsMinor, liabilitiesMinor: input.liabilitiesMinor },
    });
}

export async function listNetWorthSnapshots(userId: string) {
  return db
    .select()
    .from(netWorthSnapshots)
    .where(eq(netWorthSnapshots.userId, userId))
    .orderBy(asc(netWorthSnapshots.onDate));
}

/* ----------------------------------------------------------- revisions --- */

export async function insertRevision(input: {
  userId: string;
  entityType: string;
  entityId: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}): Promise<void> {
  await db.insert(recordRevisions).values(input);
}

export async function listRevisions(userId: string, entityType: string, entityId: string) {
  return db
    .select()
    .from(recordRevisions)
    .where(
      and(
        eq(recordRevisions.userId, userId),
        eq(recordRevisions.entityType, entityType),
        eq(recordRevisions.entityId, entityId),
      ),
    )
    .orderBy(desc(recordRevisions.createdAt));
}
