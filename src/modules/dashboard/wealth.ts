import { isCurrency, ratioToPercent, type Currency } from '@nestedflow/domain/money';
import * as productivityRepo from '@/modules/productivity/repository';
import * as productivity from '@/modules/productivity/service';
import { weekContaining, shiftWeek } from '@/modules/review/analysis';
import * as reviewRepo from '@/modules/review/repository';
import * as tradingRepo from '@/modules/trading/repository';
import * as repo from './repository';

/**
 * The wealth dashboard: five figures that say how the whole system is doing.
 *
 * Net worth and savings rate are counted in the base currency only, so two
 * currencies are never added together; trading is the primary account, as
 * everywhere else. A figure with nothing behind it is null, and the page says
 * so rather than showing a zero that looks like a result.
 */

export type Wealth = {
  currency: Currency;
  netWorth: {
    minor: bigint;
    /** Month-end values, oldest first, ending with this month to date. */
    trend: { month: string; minor: bigint }[];
  } | null;
  savingsRate: { percent: number; incomeMinor: bigint; expenseMinor: bigint } | null;
  goals: { averagePercent: number; active: number; onTrack: number } | null;
  trading: {
    currency: Currency;
    trades: number;
    winRatePercent: number;
    netPnlMinor: bigint;
    /** Cumulative P&L over the last closed trades, oldest first. */
    curve: bigint[];
  } | null;
  tasks: { plannedDone: number; planned: number; completed: number; lastWeekCompleted: number };
};

const TREND_MONTHS = 6;
const CURVE_TRADES = 20;

async function netWorthTrend(userId: string, currency: Currency, today: string) {
  const monthEnd = (m: string) =>
    new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);

  const [opening, monthly] = await Promise.all([
    repo.openingBalances(userId, currency),
    repo.monthlyMovement(userId, currency),
  ]);
  if (opening.accounts === 0) return null;

  // Months from the first sign of money (an account, or an imported older
  // transaction) to now, at most six of them.
  const thisMonth = today.slice(0, 7);
  const firstSeen = [opening.firstMonth ?? thisMonth, monthly[0]?.month ?? thisMonth].sort()[0]!;
  const months: string[] = [];
  for (let i = TREND_MONTHS - 1; i >= 0; i -= 1) {
    const d = new Date(
      Date.UTC(Number(thisMonth.slice(0, 4)), Number(thisMonth.slice(5, 7)) - 1 - i, 1),
    );
    const m = d.toISOString().slice(0, 7);
    if (m >= firstSeen) months.push(m);
  }

  const trend = months.map((m) => {
    const end = m === thisMonth ? today : monthEnd(m);
    const moved = monthly
      .filter((row) => `${row.month}-01` <= end)
      .reduce((sum, row) => sum + row.minor, 0n);
    return { month: m, minor: opening.totalMinor + moved };
  });

  // The headline counts every recorded transaction, exactly as the Finance
  // balance does; the trend's last point stops at today.
  const all = monthly.reduce((sum, row) => sum + row.minor, 0n);
  return { minor: opening.totalMinor + all, trend };
}

export async function buildWealth(
  user: { id: string; timezone: string; baseCurrency: string },
  today: string,
  now: Date = new Date(),
): Promise<Wealth> {
  const currency: Currency = isCurrency(user.baseCurrency) ? user.baseCurrency : 'INR';
  const week = weekContaining(today);

  const [netWorth, month, goals, tradingAccounts, thisWeek, lastWeek] = await Promise.all([
    netWorthTrend(user.id, currency, today),
    repo.incomeAndSpending(user.id, currency, `${today.slice(0, 7)}-01`, today),
    productivityRepo.listGoals(user.id, 'active'),
    tradingRepo.listTradingAccounts(user.id),
    reviewRepo.taskFacts(user.id, user.timezone, week, now),
    reviewRepo.taskFacts(user.id, user.timezone, shiftWeek(week, -1), now),
  ]);

  const progress = goals.map((g) => productivity.describeProgress(g, today));

  const primary = tradingAccounts.find((a) => a.environment === 'live') ?? tradingAccounts[0];
  let trading: Wealth['trading'] = null;
  if (primary && isCurrency(primary.currency)) {
    const since = new Date(now.getTime() - 30 * 86_400_000);
    const [pnls, series] = await Promise.all([
      repo.closedPnlSince(user.id, primary.id, since),
      tradingRepo.closedPnlSeries(user.id, primary.id),
    ]);
    let running = 0n;
    const curve = series.slice(-CURVE_TRADES).map((p) => (running += p));
    trading = {
      currency: primary.currency,
      trades: pnls.length,
      winRatePercent:
        pnls.length > 0 ? Math.round((pnls.filter((p) => p > 0n).length / pnls.length) * 100) : 0,
      netPnlMinor: pnls.reduce((a, b) => a + b, 0n),
      curve,
    };
  }

  return {
    currency,
    netWorth,
    savingsRate:
      month.incomeMinor > 0n
        ? {
            percent: ratioToPercent(month.incomeMinor - month.expenseMinor, month.incomeMinor),
            ...month,
          }
        : null,
    goals:
      progress.length > 0
        ? {
            averagePercent: Math.round(
              progress.reduce((sum, g) => sum + g.percent, 0) / progress.length,
            ),
            active: progress.length,
            onTrack: progress.filter((g) => !g.offTrack).length,
          }
        : null,
    trading,
    tasks: {
      plannedDone: thisWeek.plannedDone,
      planned: thisWeek.planned,
      completed: thisWeek.completed,
      lastWeekCompleted: lastWeek.completed,
    },
  };
}
