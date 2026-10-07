import { and, asc, eq, gte, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { accounts, transactions } from '@/modules/finance/schema';
import { trades } from '@/modules/trading/schema';

/** Queries behind the wealth dashboard. As everywhere: `userId` first, filtered on. */

/** Opening balances of the user's accounts in one currency, and when the first was opened. */
export async function openingBalances(userId: string, currency: string) {
  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(${accounts.openingBalanceMinor}), 0)::text`,
      n: sql<number>`count(*)::int`,
      firstMonth: sql<string | null>`to_char(min(${accounts.createdAt}), 'YYYY-MM')`,
    })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.currency, currency)));
  return {
    totalMinor: BigInt(row?.total ?? '0'),
    accounts: row?.n ?? 0,
    firstMonth: row?.firstMonth ?? null,
  };
}

/** Net movement per calendar month across the user's accounts in one currency. */
export async function monthlyMovement(userId: string, currency: string) {
  const rows = await db
    .select({
      month: sql<string>`to_char(${transactions.occurredOn}, 'YYYY-MM')`,
      total: sql<string>`sum(${transactions.amountMinor})::text`,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(and(eq(transactions.userId, userId), eq(accounts.currency, currency)))
    .groupBy(sql`1`)
    .orderBy(sql`1`);
  return rows.map((r) => ({ month: r.month, minor: BigInt(r.total) }));
}

/** Income and spending between two days in one currency, transfers excluded. */
export async function incomeAndSpending(
  userId: string,
  currency: string,
  from: string,
  to: string,
) {
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
        ne(transactions.kind, 'transfer'),
        sql`${transactions.occurredOn} between ${from} and ${to}`,
      ),
    );
  return {
    incomeMinor: BigInt(row?.income ?? '0'),
    expenseMinor: -BigInt(row?.expense ?? '0'),
  };
}

/** Realised P&L of each trade on one account closed since an instant, in close order. */
export async function closedPnlSince(userId: string, tradingAccountId: string, since: Date) {
  const rows = await db
    .select({ pnl: sql<string>`${trades.realizedPnlMinor}::text` })
    .from(trades)
    .where(
      and(
        eq(trades.userId, userId),
        eq(trades.tradingAccountId, tradingAccountId),
        eq(trades.status, 'closed'),
        gte(trades.closedAt, since),
      ),
    )
    .orderBy(asc(trades.closedAt));
  return rows.map((r) => BigInt(r.pnl));
}
