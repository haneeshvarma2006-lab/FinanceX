import { isCurrency, type Currency } from '@nestedflow/domain/money';
import * as rulesRepo from '@/modules/rules/repository';
import * as tradingRepo from '@/modules/trading/repository';
import { COSTLY_EMOTIONS } from '@/modules/trading/validators';
import {
  analyseWeek,
  daysElapsed,
  worstLosingStreak,
  type Review,
  type WeekFacts,
  type WeekRange,
} from './analysis';
import * as repo from './repository';

export type WeekReview = { facts: WeekFacts; review: Review; elapsed: number };

/**
 * Gather one week of the user's records and judge it.
 *
 * Money is counted in the base currency only and trading on the primary
 * account only (live before paper, as on Today), so no figure ever adds two
 * currencies together.
 */
export async function reviewWeek(
  user: { id: string; timezone: string; baseCurrency: string; locale: string },
  week: WeekRange,
  today: string,
  now: Date = new Date(),
): Promise<WeekReview> {
  const elapsed = daysElapsed(week, today);
  const baseCurrency: Currency = isCurrency(user.baseCurrency) ? user.baseCurrency : 'INR';

  const [taskFacts, habits, money, journal, rules, tradingAccounts] = await Promise.all([
    repo.taskFacts(user.id, user.timezone, week, now),
    repo.habitFacts(user.id, user.timezone, week, elapsed),
    repo.moneyFacts(user.id, baseCurrency, week),
    repo.journalFacts(user.id, user.timezone, week),
    rulesRepo.listRules(user.id),
    tradingRepo.listTradingAccounts(user.id),
  ]);

  const primary = tradingAccounts.find((a) => a.environment === 'live') ?? tradingAccounts[0];
  let trading: WeekFacts['trading'] = null;

  if (primary && isCurrency(primary.currency)) {
    const { closed, tags } = await repo.closedTradesInWeek(
      user.id,
      primary.id,
      user.timezone,
      week,
    );
    const pnlById = new Map(closed.map((t) => [t.id, t.pnlMinor]));

    const costly = new Map<string, { emotion: string; trades: number; netPnlMinor: bigint }>();
    for (const tag of tags) {
      if (!COSTLY_EMOTIONS.includes(tag.emotion)) continue;
      const group = costly.get(tag.emotion) ?? { emotion: tag.emotion, trades: 0, netPnlMinor: 0n };
      group.trades += 1;
      group.netPnlMinor += pnlById.get(tag.tradeId) ?? 0n;
      costly.set(tag.emotion, group);
    }

    const losses = closed.filter((t) => t.pnlMinor < 0n);
    const biggest = losses.sort((a, b) => (a.pnlMinor < b.pnlMinor ? -1 : 1))[0];

    trading = {
      currency: primary.currency,
      closed: closed.length,
      wins: closed.filter((t) => t.pnlMinor > 0n).length,
      netPnlMinor: closed.reduce((sum, t) => sum + t.pnlMinor, 0n),
      worstStreak: worstLosingStreak(closed),
      biggestLoss: biggest ? { symbol: biggest.symbol, pnlMinor: biggest.pnlMinor } : null,
      costly: [...costly.values()],
    };
  }

  const facts: WeekFacts = {
    locale: user.locale || 'en-IN',
    tasks: taskFacts,
    habits,
    money:
      money.count > 0 || money.previousExpenseMinor > 0n
        ? {
            currency: baseCurrency,
            incomeMinor: money.incomeMinor,
            expenseMinor: money.expenseMinor,
            previousExpenseMinor: money.previousExpenseMinor,
            topCategory: money.topCategory,
          }
        : null,
    trading,
    notesWritten: journal.notesWritten,
    decisions: journal.decisions,
    rules: rules.map((r) => ({
      triggerType: r.triggerType,
      count: typeof r.triggerConfig.count === 'number' ? r.triggerConfig.count : null,
      enabled: r.enabled,
    })),
  };

  return { facts, review: analyseWeek(facts), elapsed };
}
