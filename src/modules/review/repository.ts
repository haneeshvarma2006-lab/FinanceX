import { and, asc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { decisions } from '@/modules/decisions/schema';
import { categories, transactions } from '@/modules/finance/schema';
import { notes } from '@/modules/notes/schema';
import { habitEntries, habits, tasks } from '@/modules/productivity/schema';
import { tradeNotes, trades } from '@/modules/trading/schema';
import type { WeekRange } from './analysis';

/**
 * Aggregates for one calendar week in the user's own timezone.
 *
 * Instants (completion, close, creation) are converted to the user's local
 * date in SQL with AT TIME ZONE, so "Tuesday" means their Tuesday — not the
 * server's, and not UTC's.
 */

const localDay = (column: unknown, timezone: string) =>
  sql`(${column} at time zone ${timezone})::date`;

export async function taskFacts(userId: string, timezone: string, week: WeekRange, now: Date) {
  const completedInWeek = sql`${tasks.completedAt} is not null and ${localDay(tasks.completedAt, timezone)} between ${week.start} and ${week.end}`;
  const [row] = await db
    .select({
      completed: sql<number>`count(*) filter (where ${completedInWeek})::int`,
      planned: sql<number>`count(*) filter (where ${tasks.scheduledFor} between ${week.start} and ${week.end} and ${tasks.status} <> 'cancelled')::int`,
      plannedDone: sql<number>`count(*) filter (where ${tasks.scheduledFor} between ${week.start} and ${week.end} and ${tasks.status} = 'done')::int`,
      overdueOpen: sql<number>`count(*) filter (where ${tasks.status} in ('todo','doing') and ${tasks.dueAt} < ${now})::int`,
    })
    .from(tasks)
    .where(eq(tasks.userId, userId));

  const categoryRows = await db
    .select({ category: tasks.category, n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(eq(tasks.userId, userId), completedInWeek))
    .groupBy(tasks.category);

  const byCategory: Record<string, number> = {};
  for (const r of categoryRows) if (r.category) byCategory[r.category] = r.n;

  return { ...(row ?? { completed: 0, planned: 0, plannedDone: 0, overdueOpen: 0 }), byCategory };
}

/**
 * Each active habit with the days it was logged this week, against what the
 * week asked of it: a daily habit counts the days that have happened (since
 * it existed), a weekly one its own target.
 */
export async function habitFacts(
  userId: string,
  timezone: string,
  week: WeekRange,
  elapsed: number,
) {
  const rows = await db
    .select({
      name: habits.name,
      cadence: habits.cadence,
      targetPerPeriod: habits.targetPerPeriod,
      createdOn: sql<string>`${localDay(habits.createdAt, timezone)}::text`,
      done: sql<number>`count(${habitEntries.id})::int`,
    })
    .from(habits)
    .leftJoin(
      habitEntries,
      and(
        eq(habitEntries.habitId, habits.id),
        sql`${habitEntries.onDate} between ${week.start} and ${week.end}`,
      ),
    )
    .where(and(eq(habits.userId, userId), isNull(habits.archivedAt)))
    .groupBy(habits.id, habits.name, habits.cadence, habits.targetPerPeriod, habits.createdAt);

  return rows.map((h) => {
    if (h.cadence === 'weekly') return { name: h.name, done: h.done, target: h.targetPerPeriod };
    // A habit added on Thursday is not behind for Monday to Wednesday.
    const started = h.createdOn > week.start ? h.createdOn : week.start;
    const lost = Math.round((Date.parse(started) - Date.parse(week.start)) / 86_400_000);
    return { name: h.name, done: h.done, target: Math.max(0, elapsed - lost) };
  });
}

/** Income and spending in one currency, transfers excluded. */
export async function moneyFacts(userId: string, currency: string, week: WeekRange) {
  const totals = async (from: string, to: string) => {
    const [row] = await db
      .select({
        income: sql<string>`coalesce(sum(${transactions.amountMinor}) filter (where ${transactions.kind} = 'income'), 0)::text`,
        expense: sql<string>`coalesce(sum(${transactions.amountMinor}) filter (where ${transactions.kind} = 'expense'), 0)::text`,
        n: sql<number>`count(*)::int`,
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
      count: row?.n ?? 0,
    };
  };

  const previousStart = new Date(Date.parse(week.start) - 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const previousEnd = new Date(Date.parse(week.start) - 86_400_000).toISOString().slice(0, 10);

  const [current, previous, [top]] = await Promise.all([
    totals(week.start, week.end),
    totals(previousStart, previousEnd),
    db
      .select({
        name: sql<string>`coalesce(${categories.name}, 'Uncategorised')`,
        spent: sql<string>`(-sum(${transactions.amountMinor}))::text`,
      })
      .from(transactions)
      .leftJoin(categories, eq(categories.id, transactions.categoryId))
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.currency, currency),
          eq(transactions.kind, 'expense'),
          sql`${transactions.occurredOn} between ${week.start} and ${week.end}`,
        ),
      )
      .groupBy(categories.name)
      .orderBy(sql`sum(${transactions.amountMinor}) asc`)
      .limit(1),
  ]);

  return {
    ...current,
    previousExpenseMinor: previous.expenseMinor,
    topCategory: top ? { name: top.name, spentMinor: BigInt(top.spent) } : null,
  };
}

/** Trades on one account closed this week, in close order, with their feelings. */
export async function closedTradesInWeek(
  userId: string,
  tradingAccountId: string,
  timezone: string,
  week: WeekRange,
) {
  const rows = await db
    .select({
      id: trades.id,
      symbol: trades.symbol,
      pnl: sql<string>`${trades.realizedPnlMinor}::text`,
      day: sql<string>`${localDay(trades.closedAt, timezone)}::text`,
    })
    .from(trades)
    .where(
      and(
        eq(trades.userId, userId),
        eq(trades.tradingAccountId, tradingAccountId),
        eq(trades.status, 'closed'),
        sql`${trades.closedAt} is not null and ${localDay(trades.closedAt, timezone)} between ${week.start} and ${week.end}`,
      ),
    )
    .orderBy(asc(trades.closedAt));

  const tags =
    rows.length === 0
      ? []
      : await db
          .selectDistinct({ tradeId: tradeNotes.tradeId, emotion: tradeNotes.emotionTag })
          .from(tradeNotes)
          .where(
            and(
              eq(tradeNotes.userId, userId),
              inArray(
                tradeNotes.tradeId,
                rows.map((r) => r.id),
              ),
              sql`${tradeNotes.emotionTag} is not null`,
            ),
          );

  return {
    closed: rows.map((r) => ({ id: r.id, symbol: r.symbol, pnlMinor: BigInt(r.pnl), day: r.day })),
    tags: tags.map((t) => ({ tradeId: t.tradeId, emotion: t.emotion! })),
  };
}

export async function journalFacts(userId: string, timezone: string, week: WeekRange) {
  const inWeek = (column: unknown) =>
    sql`${column} is not null and ${localDay(column, timezone)} between ${week.start} and ${week.end}`;

  const [[noteRow], [decisionRow]] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(notes)
      .where(and(eq(notes.userId, userId), inWeek(notes.createdAt))),
    db
      .select({
        made: sql<number>`count(*) filter (where ${inWeek(decisions.createdAt)})::int`,
        reviewed: sql<number>`count(*) filter (where ${inWeek(decisions.reviewedAt)})::int`,
        right: sql<number>`count(*) filter (where ${inWeek(decisions.reviewedAt)} and ${decisions.verdict} = 'right')::int`,
        wrong: sql<number>`count(*) filter (where ${inWeek(decisions.reviewedAt)} and ${decisions.verdict} = 'wrong')::int`,
      })
      .from(decisions)
      .where(eq(decisions.userId, userId)),
  ]);

  return {
    notesWritten: noteRow?.n ?? 0,
    decisions: decisionRow ?? { made: 0, reviewed: 0, right: 0, wrong: 0 },
  };
}
