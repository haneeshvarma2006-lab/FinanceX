import { z } from 'zod';
import { parseAmount, type Currency } from '@/lib/money';
import type { NotificationKind } from '@/modules/productivity/notifications';
import type { TodaySnapshot } from '@/modules/dashboard/service';

/**
 * Trigger catalogue.
 *
 * Each trigger is a named condition with a Zod-validated config and a pure
 * `evaluate` that reads the daily snapshot. Pure because a trigger that could
 * write, fetch, or throw would make rule evaluation unpredictable and hard to
 * explain — and every evaluation has to be explainable, since the run log
 * shows the user exactly why a rule did or did not fire.
 */

export type Observation = {
  matched: boolean;
  /** Shown verbatim in the run log. Written for the user, not for a developer. */
  reason: string;
  /** The values the decision was made from. */
  observed: Record<string, unknown>;
  /**
   * Distinguishes one occurrence from the next, so the same condition on the
   * same day cannot fire twice.
   */
  dedupeSuffix: string;
};

const countConfig = z.object({
  count: z.coerce.number().int().min(1).max(100).default(1),
});

const amountConfig = z.object({
  /** Major units as typed; parsed against the user's currency at evaluation. */
  amount: z.string().trim().min(1).max(24),
});

export const TRIGGERS = {
  tasks_overdue: {
    label: 'Tasks are overdue',
    /**
     * Which notification kind this trigger's alerts belong to, so the
     * per-kind switches in Settings still govern a rule built on it. Without
     * this every rule would collapse into one undifferentiated switch.
     */
    notificationKind: 'task_overdue' satisfies NotificationKind,
    describe: (c: { count: number }) =>
      `${c.count} or more task${c.count === 1 ? ' is' : 's are'} past due`,
    config: countConfig,
    evaluate(config: z.infer<typeof countConfig>, s: TodaySnapshot): Observation {
      const matched = s.tasks.overdue >= config.count;
      return {
        matched,
        reason: matched
          ? `${s.tasks.overdue} overdue, threshold is ${config.count}`
          : `${s.tasks.overdue} overdue, below the threshold of ${config.count}`,
        observed: { overdue: s.tasks.overdue, threshold: config.count },
        dedupeSuffix: s.today,
      };
    },
  },

  habit_streak_at_risk: {
    label: 'A habit streak is about to break',
    /**
     * Which notification kind this trigger's alerts belong to, so the
     * per-kind switches in Settings still govern a rule built on it. Without
     * this every rule would collapse into one undifferentiated switch.
     */
    notificationKind: 'habit_streak_risk' satisfies NotificationKind,
    describe: (c: { count: number }) =>
      `a streak of ${c.count} or more days has not been logged today`,
    config: countConfig,
    evaluate(config: z.infer<typeof countConfig>, s: TodaySnapshot): Observation {
      const at = s.habits.atRisk.filter((h) => h.streak.current >= config.count);
      return {
        matched: at.length > 0,
        reason: at.length
          ? `${at.map((h) => `${h.name} (${h.streak.current} days)`).join(', ')} not yet logged`
          : `no streak of ${config.count}+ days is unlogged today`,
        observed: { atRisk: at.map((h) => ({ name: h.name, streak: h.streak.current })) },
        dedupeSuffix: `${s.today}:${at.map((h) => h.id).join(',')}`,
      };
    },
  },

  goal_behind_pace: {
    label: 'A goal is falling behind',
    /**
     * Which notification kind this trigger's alerts belong to, so the
     * per-kind switches in Settings still govern a rule built on it. Without
     * this every rule would collapse into one undifferentiated switch.
     */
    notificationKind: 'goal_off_track' satisfies NotificationKind,
    describe: () => 'a goal has made less progress than its elapsed time',
    config: z.object({}),
    evaluate(_config: Record<string, never>, s: TodaySnapshot): Observation {
      const behind = s.goals.offTrack;
      return {
        matched: behind.length > 0,
        reason: behind.length
          ? `${behind.map((g) => `${g.title} at ${g.percent}%`).join(', ')}`
          : 'every goal is on pace',
        observed: { behind },
        dedupeSuffix: `${s.today}:${behind.map((g) => g.id).join(',')}`,
      };
    },
  },

  budget_exceeded: {
    label: 'A budget has been exceeded',
    /**
     * Which notification kind this trigger's alerts belong to, so the
     * per-kind switches in Settings still govern a rule built on it. Without
     * this every rule would collapse into one undifferentiated switch.
     */
    notificationKind: 'budget_exceeded' satisfies NotificationKind,
    describe: () => 'spending in a category has passed its budget',
    config: z.object({}),
    evaluate(_config: Record<string, never>, s: TodaySnapshot): Observation {
      const over = s.finance.overBudget;
      return {
        matched: over.length > 0,
        reason: over.length
          ? `${over.length} budget${over.length === 1 ? '' : 's'} over the limit this month`
          : 'no budget is over its limit',
        observed: { overBudgetCount: over.length },
        dedupeSuffix: `${s.today}:${over.map((b) => b.categoryId).join(',')}`,
      };
    },
  },

  consecutive_losing_trades: {
    label: 'A run of losing trades',
    /**
     * Which notification kind this trigger's alerts belong to, so the
     * per-kind switches in Settings still govern a rule built on it. Without
     * this every rule would collapse into one undifferentiated switch.
     */
    notificationKind: 'trading_review_due' satisfies NotificationKind,
    describe: (c: { count: number }) => `${c.count} or more losing trades in a row`,
    config: countConfig,
    evaluate(config: z.infer<typeof countConfig>, s: TodaySnapshot): Observation {
      const matched = s.trading.consecutiveLosses >= config.count;
      return {
        matched,
        reason: matched
          ? `${s.trading.consecutiveLosses} losses in a row, threshold is ${config.count}`
          : `${s.trading.consecutiveLosses} losses in a row, below ${config.count}`,
        observed: { losses: s.trading.consecutiveLosses, threshold: config.count },
        dedupeSuffix: `${s.today}:${s.trading.consecutiveLosses}`,
      };
    },
  },

  spent_more_than: {
    label: 'Spending this month passes an amount',
    /**
     * Which notification kind this trigger's alerts belong to, so the
     * per-kind switches in Settings still govern a rule built on it. Without
     * this every rule would collapse into one undifferentiated switch.
     */
    notificationKind: 'budget_exceeded' satisfies NotificationKind,
    describe: (c: { amount: string }) => `more than ${c.amount} spent this month`,
    config: amountConfig,
    evaluate(config: z.infer<typeof amountConfig>, s: TodaySnapshot): Observation {
      /**
       * Compared in integer minor units, never by parsing both sides to a
       * float. A threshold read through a double would compare wrongly at the
       * boundary — exactly where a threshold matters.
       */
      let thresholdMinor: bigint;
      try {
        thresholdMinor = parseAmount(config.amount, s.finance.currency as Currency);
      } catch {
        return {
          matched: false,
          reason: `"${config.amount}" is not a valid amount`,
          observed: { amount: config.amount },
          dedupeSuffix: s.today,
        };
      }

      const matched = s.finance.expenseMinor > thresholdMinor;
      return {
        matched,
        reason: matched
          ? `spent past the ${config.amount} threshold this month`
          : `this month's spending is under ${config.amount}`,
        observed: {
          spentMinor: s.finance.expenseMinor.toString(),
          thresholdMinor: thresholdMinor.toString(),
        },
        // Month-scoped: crossing the line notifies once, not every day after.
        dedupeSuffix: s.today.slice(0, 7),
      };
    },
  },

  nothing_completed_today: {
    label: 'Nothing completed today',
    /**
     * Which notification kind this trigger's alerts belong to, so the
     * per-kind switches in Settings still govern a rule built on it. Without
     * this every rule would collapse into one undifferentiated switch.
     */
    notificationKind: 'task_overdue' satisfies NotificationKind,
    describe: () => 'no task has been completed today, but work is outstanding',
    config: z.object({}),
    evaluate(_config: Record<string, never>, s: TodaySnapshot): Observation {
      const matched = s.tasks.completedToday === 0 && s.tasks.openTotal > 0;
      return {
        matched,
        reason: matched
          ? `${s.tasks.openTotal} open, none completed today`
          : s.tasks.openTotal === 0
            ? 'nothing is outstanding'
            : `${s.tasks.completedToday} completed today`,
        observed: { open: s.tasks.openTotal, completedToday: s.tasks.completedToday },
        dedupeSuffix: s.today,
      };
    },
  },
} as const;

export type TriggerType = keyof typeof TRIGGERS;
export const TRIGGER_TYPES = Object.keys(TRIGGERS) as TriggerType[];

export function isTriggerType(value: string): value is TriggerType {
  return value in TRIGGERS;
}
