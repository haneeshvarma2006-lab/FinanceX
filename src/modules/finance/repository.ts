import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { newId } from '@/lib/db/id';
import {
  accounts,
  bills,
  budgets,
  categories,
  netWorthSnapshots,
  recordRevisions,
  subscriptions,
  transactions,
  type Account,
  type Bill,
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

/* ------------------------------------------------------------- sorting --- */

/**
 * How each payee has been filed before: description, category and how many
 * times, most recent first. What an import uses to remember a choice.
 */
export async function categorisedPayees(
  userId: string,
  limit = 3000,
): Promise<{ description: string; categoryId: string; count: number }[]> {
  const rows = await db
    .select({
      description: transactions.description,
      categoryId: transactions.categoryId,
      count: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.kind, 'expense'),
        sql`${transactions.categoryId} is not null`,
      ),
    )
    .groupBy(transactions.description, transactions.categoryId)
    .orderBy(sql`max(${transactions.occurredOn}) desc`)
    .limit(Math.min(limit, 5000));
  return rows.map((r) => ({
    description: r.description,
    categoryId: r.categoryId!,
    count: r.count,
  }));
}

/** Spending with no category yet: what is left to sort. */
export async function uncategorisedExpenses(
  userId: string,
  limit = 5000,
): Promise<{ id: string; description: string }[]> {
  return db
    .select({ id: transactions.id, description: transactions.description })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.kind, 'expense'),
        isNull(transactions.categoryId),
      ),
    )
    .orderBy(desc(transactions.occurredOn))
    .limit(Math.min(limit, 10_000));
}

/**
 * File several of the person's own uncategorised payments under one
 * category, in one database transaction, each change in the revision log.
 */
export async function categoriseTransactions(
  userId: string,
  ids: readonly string[],
  categoryId: string,
): Promise<number> {
  if (ids.length === 0) return 0;
  return db.transaction(async (tx) => {
    let changed = 0;
    for (let i = 0; i < ids.length; i += 500) {
      const written = await tx
        .update(transactions)
        .set({ categoryId, updatedAt: new Date() })
        .where(
          and(
            eq(transactions.userId, userId),
            inArray(transactions.id, ids.slice(i, i + 500)),
            isNull(transactions.categoryId),
          ),
        )
        .returning({ id: transactions.id });
      if (written.length > 0) {
        await tx.insert(recordRevisions).values(
          written.map((w) => ({
            userId,
            entityType: 'transaction',
            entityId: w.id,
            action: 'categorised',
            before: { categoryId: null },
            after: { categoryId },
          })),
        );
      }
      changed += written.length;
    }
    return changed;
  });
}

/** This period's uncategorised spending, by description, for sorting by payee. */
export async function uncategorisedPayeesIn(
  userId: string,
  from: string,
  to: string,
  currency: string,
): Promise<{ name: string; spentMinor: bigint; count: number }[]> {
  const rows = await db
    .select({
      name: transactions.description,
      spent: sql<string>`(-sum(${transactions.amountMinor}))::text`,
      count: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .where(and(spendingIn(userId, from, to, currency), isNull(transactions.categoryId)))
    .groupBy(transactions.description)
    .orderBy(sql`sum(${transactions.amountMinor}) asc`)
    .limit(300);
  return rows.map((r) => ({ name: r.name, spentMinor: BigInt(r.spent), count: r.count }));
}

/* ------------------------------------------------------------ insights --- */

function spendingIn(userId: string, from: string, to: string, currency: string) {
  return and(
    eq(transactions.userId, userId),
    eq(transactions.kind, 'expense'),
    eq(transactions.currency, currency),
    gte(transactions.occurredOn, from),
    lte(transactions.occurredOn, to),
  );
}

/**
 * Money in and money out in one currency over a period. Accounts in other
 * currencies are left out rather than added up as if a dollar were a rupee.
 */
export async function totalsIn(
  userId: string,
  from: string,
  to: string,
  currency: string,
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
        eq(transactions.currency, currency),
        gte(transactions.occurredOn, from),
        lte(transactions.occurredOn, to),
        ne(transactions.kind, 'transfer'),
      ),
    );
  return {
    incomeMinor: BigInt(row?.income ?? '0'),
    expenseMinor: -BigInt(row?.expense ?? '0'),
  };
}

/** Spending per category, and how many payments made it up. */
export async function spendingByCategoryIn(
  userId: string,
  from: string,
  to: string,
  currency: string,
): Promise<{ categoryId: string | null; spentMinor: bigint; count: number }[]> {
  const rows = await db
    .select({
      categoryId: transactions.categoryId,
      spent: sql<string>`(-sum(${transactions.amountMinor}))::text`,
      count: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .where(spendingIn(userId, from, to, currency))
    .groupBy(transactions.categoryId);
  return rows.map((r) => ({
    categoryId: r.categoryId,
    spentMinor: BigInt(r.spent),
    count: r.count,
  }));
}

/** Who was paid the most: payments grouped by the name they were recorded under. */
export async function topPayees(
  userId: string,
  from: string,
  to: string,
  currency: string,
  limit = 8,
): Promise<{ name: string; spentMinor: bigint; count: number }[]> {
  const name = sql<string>`coalesce(${transactions.merchant}, ${transactions.description})`;
  const rows = await db
    .select({
      name,
      spent: sql<string>`(-sum(${transactions.amountMinor}))::text`,
      count: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .where(spendingIn(userId, from, to, currency))
    .groupBy(name)
    .orderBy(sql`sum(${transactions.amountMinor}) asc`)
    .limit(Math.min(limit, 20));
  return rows.map((r) => ({ name: r.name, spentMinor: BigInt(r.spent), count: r.count }));
}

/** The largest single payments of a period. */
export async function largestExpenses(
  userId: string,
  from: string,
  to: string,
  currency: string,
  limit = 5,
): Promise<Transaction[]> {
  return db
    .select()
    .from(transactions)
    .where(spendingIn(userId, from, to, currency))
    .orderBy(asc(transactions.amountMinor), desc(transactions.occurredOn))
    .limit(Math.min(limit, 20));
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

/** A category's budget, whatever month it started in: one per category. */
export async function findBudgetForCategory(
  userId: string,
  categoryId: string,
): Promise<Budget | undefined> {
  const [row] = await db
    .select()
    .from(budgets)
    .where(and(eq(budgets.userId, userId), eq(budgets.categoryId, categoryId)))
    .limit(1);
  return row;
}

export async function updateBudgetAmount(
  userId: string,
  id: string,
  amountMinor: bigint,
): Promise<Budget | undefined> {
  const [row] = await db
    .update(budgets)
    .set({ amountMinor, updatedAt: new Date() })
    .where(and(eq(budgets.id, id), eq(budgets.userId, userId)))
    .returning();
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

export async function findSubscription(
  userId: string,
  id: string,
): Promise<Subscription | undefined> {
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, userId)))
    .limit(1);
  return row;
}

/**
 * Move a bill on to its next due date — only if it is still on the date the
 * caller saw, so a double tap on "Paid" cannot skip a month.
 */
export async function advanceSubscription(
  userId: string,
  id: string,
  from: { nextDueOn: string },
  to: { nextDueOn: string; lastChargedOn: string },
): Promise<boolean> {
  const rows = await db
    .update(subscriptions)
    .set({ ...to, updatedAt: new Date() })
    .where(
      and(
        eq(subscriptions.id, id),
        eq(subscriptions.userId, userId),
        eq(subscriptions.nextDueOn, from.nextDueOn),
      ),
    )
    .returning({ id: subscriptions.id });
  return rows.length > 0;
}

/** Accounts with an active bill due on or before a day, for the daily reminders job. */
export async function usersWithBillsDueBy(day: string, limit: number): Promise<string[]> {
  const rows = await db
    .selectDistinct({ userId: subscriptions.userId })
    .from(subscriptions)
    .where(and(eq(subscriptions.status, 'active'), lte(subscriptions.nextDueOn, day)))
    .limit(Math.min(limit, 5000));
  return rows.map((r) => r.userId);
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

/* -------------------------------------------------------------- import --- */

/** Which of these import ids this account already holds. */
export async function existingExternalIds(
  userId: string,
  accountId: string,
  externalIds: readonly string[],
): Promise<Set<string>> {
  if (externalIds.length === 0) return new Set();
  const rows = await db
    .select({ externalId: transactions.externalId })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.accountId, accountId),
        inArray(transactions.externalId, [...externalIds]),
      ),
    );
  return new Set(rows.map((r) => r.externalId!));
}

/**
 * Entries typed by hand on this account between two days, as date and
 * signed amount — what an imported row is compared with to spot a
 * transaction the user already recorded themselves.
 */
export async function manualEntriesBetween(
  userId: string,
  accountId: string,
  from: string,
  to: string,
): Promise<{ occurredOn: string; amountMinor: bigint }[]> {
  return db
    .select({ occurredOn: transactions.occurredOn, amountMinor: transactions.amountMinor })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.accountId, accountId),
        isNull(transactions.externalId),
        gte(transactions.occurredOn, from),
        lte(transactions.occurredOn, to),
      ),
    );
}

/**
 * Insert a statement's rows in one database transaction: all of them or
 * none. A row whose import id is already on the account is skipped by the
 * unique index rather than failing the batch, so two imports racing each
 * other still cannot duplicate a line.
 */
export async function insertImportedTransactions(
  userId: string,
  rows: readonly NewTransaction[],
): Promise<number> {
  if (rows.length === 0) return 0;
  return db.transaction(async (tx) => {
    let inserted = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500).map((row) => ({
        userId,
        ...row,
        merchant: row.merchant ?? null,
        notes: row.notes ?? null,
        externalId: row.externalId ?? null,
        transferGroupId: null,
      }));
      const written = await tx.insert(transactions).values(chunk).onConflictDoNothing().returning({
        id: transactions.id,
        occurredOn: transactions.occurredOn,
        amountMinor: transactions.amountMinor,
        description: transactions.description,
      });
      if (written.length > 0) {
        await tx.insert(recordRevisions).values(
          written.map((w) => ({
            userId,
            entityType: 'transaction',
            entityId: w.id,
            action: 'imported',
            before: null,
            after: {
              occurredOn: w.occurredOn,
              amountMinor: w.amountMinor.toString(),
              description: w.description,
            },
          })),
        );
      }
      inserted += written.length;
    }
    return inserted;
  });
}

/* ---------------------------------------------------------------- bills --- */

/**
 * Expenses of exactly this amount within a few days of a bill's date: what
 * a scanned bill is checked against, so a bill already typed in or imported
 * from a statement is not recorded twice. Card and UPI payments often post a
 * day or two after the bill, hence the window.
 */
export async function expensesNear(
  userId: string,
  amountMinor: bigint,
  from: string,
  to: string,
): Promise<{ id: string; occurredOn: string; description: string; accountName: string }[]> {
  return db
    .select({
      id: transactions.id,
      occurredOn: transactions.occurredOn,
      description: transactions.description,
      accountName: accounts.name,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.kind, 'expense'),
        eq(transactions.amountMinor, -amountMinor),
        gte(transactions.occurredOn, from),
        lte(transactions.occurredOn, to),
      ),
    )
    .orderBy(asc(transactions.occurredOn))
    .limit(5);
}

/** A bill photo's record. The image itself lives in object storage. */
export async function insertBill(
  userId: string,
  input: {
    id: string;
    transactionId: string | null;
    storageKey: string;
    contentType: string;
    sizeBytes: number;
    merchant: string | null;
    amountMinor: bigint | null;
    currency: string | null;
    billDate: string | null;
  },
): Promise<Bill> {
  const [row] = await db
    .insert(bills)
    .values({ userId, ...input })
    .returning();
  if (!row) throw new Error('Bill insert returned no row');
  return row;
}

export async function findBill(userId: string, id: string): Promise<Bill | undefined> {
  const [row] = await db
    .select()
    .from(bills)
    .where(and(eq(bills.id, id), eq(bills.userId, userId)))
    .limit(1);
  return row;
}

export async function listBills(userId: string, limit = 500): Promise<Bill[]> {
  return db
    .select()
    .from(bills)
    .where(eq(bills.userId, userId))
    .orderBy(desc(bills.createdAt))
    .limit(limit);
}

/** Which of these transactions have a bill photo, and which photo. */
export async function billIdsForTransactions(
  userId: string,
  transactionIds: readonly string[],
): Promise<Map<string, string>> {
  if (transactionIds.length === 0) return new Map();
  const rows = await db
    .select({ id: bills.id, transactionId: bills.transactionId })
    .from(bills)
    .where(and(eq(bills.userId, userId), inArray(bills.transactionId, [...transactionIds])))
    .orderBy(desc(bills.createdAt));
  const map = new Map<string, string>();
  for (const r of rows)
    if (r.transactionId && !map.has(r.transactionId)) map.set(r.transactionId, r.id);
  return map;
}

/** Removes the record and returns where its photo was, so the photo can go too. */
export async function deleteBill(userId: string, id: string): Promise<string | null> {
  const [row] = await db
    .delete(bills)
    .where(and(eq(bills.id, id), eq(bills.userId, userId)))
    .returning({ storageKey: bills.storageKey });
  return row?.storageKey ?? null;
}

/** Every photo key an account owns, for deleting them with the account. */
export async function billKeysForUser(userId: string): Promise<string[]> {
  const rows = await db
    .select({ storageKey: bills.storageKey })
    .from(bills)
    .where(eq(bills.userId, userId));
  return rows.map((r) => r.storageKey);
}
