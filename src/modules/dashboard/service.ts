import { startOfMonth, endOfMonth, parseISO } from 'date-fns';
import type { Currency } from '@/lib/money';
import * as productivityRepo from '@/modules/productivity/repository';
import * as productivity from '@/modules/productivity/service';
import * as financeRepo from '@/modules/finance/repository';
import * as finance from '@/modules/finance/service';
import * as tradingRepo from '@/modules/trading/repository';
import { computeStrategyStats } from '@/modules/trading/pnl';
import type { Task } from '@/modules/productivity/schema';
import type { HabitWithStreak } from '@/modules/productivity/service';

/**
 * The dashboard's data, assembled in one place.
 *
 * Every figure here is read from the user's own records. Nothing is seeded,
 * simulated, or filled in with a plausible-looking number — a widget with no
 * data returns `hasData: false` and the UI shows a route to the first action
 * instead. A dashboard that invents a balance is worse than an empty one.
 */

export type TodaySnapshot = {
  today: string;
  /**
   * The instant this snapshot was built.
   *
   * Returned so the page can render time-relative state (what is overdue)
   * without reading a clock inside a component — one timestamp for the whole
   * render, and the same one the figures were computed against.
   */
  renderedAt: number;
  tasks: {
    hasData: boolean;
    openToday: number;
    overdue: number;
    completedToday: number;
    openTotal: number;
    next: Task[];
  };
  habits: {
    hasData: boolean;
    items: HabitWithStreak[];
    doneToday: number;
    atRisk: HabitWithStreak[];
  };
  goals: {
    hasData: boolean;
    active: number;
    offTrack: { id: string; title: string; percent: number }[];
    nearest: { id: string; title: string; percent: number; daysRemaining: number | null } | null;
  };
  finance: {
    hasData: boolean;
    currency: Currency;
    balanceMinor: bigint;
    incomeMinor: bigint;
    expenseMinor: bigint;
    overBudget: { categoryId: string; spentMinor: bigint; limitMinor: bigint }[];
  };
  trading: {
    hasData: boolean;
    currency: Currency;
    closedTrades: number;
    openTrades: number;
    netPnlMinor: bigint;
    winRatePercent: number;
    /** A run of recent losses, which is the prompt to review rather than continue. */
    consecutiveLosses: number;
  };
  focusMinutesToday: number;
};

/** The user's calendar day. Streaks and "today" must agree with their clock. */
export function todayFor(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
}

export async function buildTodaySnapshot(
  userId: string,
  timezone: string,
  baseCurrency: string,
  now: Date = new Date(),
): Promise<TodaySnapshot> {
  const today = todayFor(timezone);
  const monthStart = startOfMonth(parseISO(today)).toISOString().slice(0, 10);
  const monthEnd = endOfMonth(parseISO(today)).toISOString().slice(0, 10);
  const dayStart = parseISO(today);

  const [
    taskCounts,
    nextTasks,
    habits,
    goals,
    accounts,
    balances,
    totals,
    budgets,
    tradingAccounts,
    focusMinutes,
  ] = await Promise.all([
    productivityRepo.taskCounts(userId, today, now),
    productivityRepo.listTasks(userId, {
      status: ['todo', 'doing'],
      sort: 'dueAt',
      direction: 'asc',
      limit: 5,
    }),
    productivity.habitsWithStreaks(userId, today),
    productivityRepo.listGoals(userId, 'active'),
    financeRepo.listAccounts(userId),
    financeRepo.accountBalances(userId),
    financeRepo.periodTotals(userId, monthStart, monthEnd),
    finance.budgetProgress(userId, monthStart, monthEnd),
    tradingRepo.listTradingAccounts(userId),
    productivityRepo.focusMinutesSince(userId, dayStart),
  ]);

  const goalProgress = goals.map((goal) => productivity.describeProgress(goal, today));
  const offTrack = goalProgress
    .filter((g) => g.offTrack)
    .map((g) => ({ id: g.goal.id, title: g.goal.title, percent: g.percent }));

  const withDates = goalProgress
    .filter((g) => g.daysRemaining !== null)
    .sort((a, b) => (a.daysRemaining ?? 0) - (b.daysRemaining ?? 0));

  const nearest = withDates[0]
    ? {
        id: withDates[0].goal.id,
        title: withDates[0].goal.title,
        percent: withDates[0].percent,
        daysRemaining: withDates[0].daysRemaining,
      }
    : null;

  /**
   * A habit is "at risk" when it has a live streak that today has not yet
   * extended. Flagging every unlogged habit would make the warning noise.
   */
  const atRisk = habits.filter((h) => h.streak.current > 0 && !h.streak.completedToday);

  // Trading is per-account; the dashboard summarises the first live account
  // rather than mixing paper results into a headline figure.
  const primaryTrading =
    tradingAccounts.find((a) => a.environment === 'live') ?? tradingAccounts[0];

  let closedTrades = 0;
  let openTrades = 0;
  let netPnlMinor = 0n;
  let winRatePercent = 0;
  let consecutiveLosses = 0;

  if (primaryTrading) {
    const [pnls, open] = await Promise.all([
      tradingRepo.closedPnlSeries(userId, primaryTrading.id),
      tradingRepo.listTrades(userId, {
        tradingAccountId: primaryTrading.id,
        status: 'open',
        limit: 100,
      }),
    ]);

    const stats = computeStrategyStats(pnls);
    closedTrades = stats.trades;
    netPnlMinor = stats.netPnlMinor;
    winRatePercent = stats.winRatePercent;
    openTrades = open.length;

    for (let i = pnls.length - 1; i >= 0; i -= 1) {
      if (pnls[i]! < 0n) consecutiveLosses += 1;
      else break;
    }
  }

  const balanceMinor = [...balances.values()].reduce((a, b) => a + b, 0n);

  return {
    today,
    renderedAt: now.getTime(),
    tasks: {
      hasData: taskCounts.openTotal > 0 || taskCounts.completedToday > 0,
      ...taskCounts,
      next: nextTasks,
    },
    habits: {
      hasData: habits.length > 0,
      items: habits,
      doneToday: habits.filter((h) => h.streak.completedToday).length,
      atRisk,
    },
    goals: {
      hasData: goals.length > 0,
      active: goals.length,
      offTrack,
      nearest,
    },
    finance: {
      hasData: accounts.length > 0,
      currency: baseCurrency as Currency,
      balanceMinor,
      incomeMinor: totals.incomeMinor,
      expenseMinor: totals.expenseMinor,
      overBudget: budgets
        .filter((b) => b.overBudget)
        .map((b) => ({
          categoryId: b.categoryId,
          spentMinor: b.spentMinor,
          limitMinor: b.limitMinor,
        })),
    },
    trading: {
      hasData: tradingAccounts.length > 0,
      currency: (primaryTrading?.currency ?? baseCurrency) as Currency,
      closedTrades,
      openTrades,
      netPnlMinor,
      winRatePercent,
      consecutiveLosses,
    },
    focusMinutesToday: focusMinutes,
  };
}

/**
 * Raise notifications for conditions the snapshot reveals.
 *
 * Deliberately derived from the same read the dashboard does, so what the user
 * is told matches what they can see. Every raise is deduplicated per day.
 */
export async function raiseDashboardNotifications(
  userId: string,
  snapshot: TodaySnapshot,
): Promise<void> {
  const { notify } = await import('@/modules/productivity/notifications');

  if (snapshot.tasks.overdue > 0) {
    await notify(userId, {
      kind: 'task_overdue',
      title: `${snapshot.tasks.overdue} task${snapshot.tasks.overdue === 1 ? '' : 's'} overdue`,
      body: 'Past their due time and still open.',
      href: '/tasks',
      dedupeKey: `task_overdue:${snapshot.today}`,
    });
  }

  for (const habit of snapshot.habits.atRisk) {
    if (habit.streak.current < 3) continue; // Not worth interrupting for.
    await notify(userId, {
      kind: 'habit_streak_risk',
      title: `${habit.name}: ${habit.streak.current}-day streak at risk`,
      body: 'Not logged yet today.',
      href: '/habits',
      entityType: 'habit',
      entityId: habit.id,
      dedupeKey: `habit_streak_risk:${habit.id}:${snapshot.today}`,
    });
  }

  for (const goal of snapshot.goals.offTrack) {
    await notify(userId, {
      kind: 'goal_off_track',
      title: `${goal.title} is behind pace`,
      body: `At ${goal.percent}% with less time remaining than that.`,
      href: '/goals',
      entityType: 'goal',
      entityId: goal.id,
      dedupeKey: `goal_off_track:${goal.id}:${snapshot.today}`,
    });
  }

  for (const budget of snapshot.finance.overBudget) {
    await notify(userId, {
      kind: 'budget_exceeded',
      title: 'A budget has been exceeded',
      body: 'Spending in one of your categories has passed its limit this month.',
      href: '/finance',
      entityType: 'budget',
      entityId: budget.categoryId,
      dedupeKey: `budget_exceeded:${budget.categoryId}:${snapshot.today}`,
    });
  }

  /**
   * The product thesis in one rule: a run of losses books a review rather than
   * leaving the next trade to be taken on tilt.
   */
  if (snapshot.trading.consecutiveLosses >= 3) {
    await notify(userId, {
      kind: 'trading_review_due',
      title: `${snapshot.trading.consecutiveLosses} losing trades in a row`,
      body: 'Worth reviewing what they had in common before the next one.',
      href: '/trading',
      dedupeKey: `trading_review_due:${snapshot.today}`,
    });
  }
}
