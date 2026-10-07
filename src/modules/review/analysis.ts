import { formatMoney, ratioToPercent, type Currency } from '@nestedflow/domain/money';

/**
 * The weekly review's judgement, as a pure function of the week's facts.
 *
 * It names ONE thing to fix — the costliest pattern in the week, by a fixed
 * order of severity — and, where a rule in the catalogue can prevent it
 * next time, offers that rule as a single tap. Picking one is the point: a
 * review that lists nine problems gets none of them fixed.
 *
 * Nothing here is a model or a guess. Every finding is a count or a sum of
 * the user's own records, and the wording says what was measured.
 */

export type WeekRange = { start: string; end: string };

const DAY_MS = 86_400_000;

function toDate(isoDay: string): Date {
  return new Date(`${isoDay}T12:00:00Z`);
}
function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Monday to Sunday containing `isoDay`. */
export function weekContaining(isoDay: string): WeekRange {
  const date = toDate(isoDay);
  const offset = (date.getUTCDay() + 6) % 7; // Monday = 0
  const start = new Date(date.getTime() - offset * DAY_MS);
  return { start: toIso(start), end: toIso(new Date(start.getTime() + 6 * DAY_MS)) };
}

export function shiftWeek(range: WeekRange, weeks: number): WeekRange {
  return weekContaining(toIso(new Date(toDate(range.start).getTime() + weeks * 7 * DAY_MS)));
}

/** Days of the week that have happened, today included: 1..7. */
export function daysElapsed(range: WeekRange, today: string): number {
  if (today > range.end) return 7;
  if (today < range.start) return 0;
  return Math.round((toDate(today).getTime() - toDate(range.start).getTime()) / DAY_MS) + 1;
}

export type Money = { minor: bigint; currency: Currency };

export type WeekFacts = {
  locale: string;
  tasks: {
    completed: number;
    /** Tasks scheduled for a day in the week. */
    planned: number;
    plannedDone: number;
    /** Open now and past their due time. */
    overdueOpen: number;
    byCategory: Record<string, number>;
  };
  habits: { name: string; done: number; target: number }[];
  money: {
    currency: Currency;
    incomeMinor: bigint;
    expenseMinor: bigint;
    previousExpenseMinor: bigint;
    topCategory: { name: string; spentMinor: bigint } | null;
  } | null;
  trading: {
    currency: Currency;
    closed: number;
    wins: number;
    netPnlMinor: bigint;
    /** The longest run of consecutive losses closed this week. */
    worstStreak: { count: number; day: string };
    biggestLoss: { symbol: string; pnlMinor: bigint } | null;
    /** Results of trades tagged with a costly feeling (FOMO, revenge, ...). */
    costly: { emotion: string; trades: number; netPnlMinor: bigint }[];
  } | null;
  notesWritten: number;
  decisions: { made: number; reviewed: number; right: number; wrong: number };
  /** Rules the user already has, so a suggestion never duplicates one. */
  rules: { triggerType: string; count: number | null; enabled: boolean }[];
};

/** Rule templates a review can offer. The server builds the rule from the key alone. */
export const RULE_TEMPLATES = {
  'reduce-risk-after-losses': {
    name: 'Reduce risk after 2 losses in a row',
    triggerType: 'consecutive_losing_trades',
    triggerConfig: { count: 2 },
    actionType: 'create_task',
    actionConfig: {
      title: 'Reduce risk: half size on your next trade',
      priority: 1,
      schedule: 'today',
    },
  },
  'nudge-when-nothing-done': {
    name: 'Nudge me when nothing is done',
    triggerType: 'nothing_completed_today',
    triggerConfig: {},
    actionType: 'notify',
    actionConfig: {
      title: 'Nothing finished yet today',
      body: 'Pick the smallest open task and finish it.',
    },
  },
  'flag-overdue-work': {
    name: 'Flag overdue work',
    triggerType: 'tasks_overdue',
    triggerConfig: { count: 1 },
    actionType: 'notify',
    actionConfig: { title: 'You have overdue tasks', body: 'Past their due time and still open.' },
  },
  'protect-streaks': {
    name: 'Protect my streaks',
    triggerType: 'habit_streak_at_risk',
    triggerConfig: { count: 2 },
    actionType: 'notify',
    actionConfig: { title: 'A habit streak is at risk', body: 'Not logged yet today.' },
  },
} as const;

export type RuleTemplateKey = keyof typeof RULE_TEMPLATES;

export function isRuleTemplateKey(value: string): value is RuleTemplateKey {
  return Object.hasOwn(RULE_TEMPLATES, value);
}

export type Suggestion =
  | { kind: 'rule'; template: RuleTemplateKey; label: string }
  /** An equivalent rule is already switched on. */
  | { kind: 'covered'; label: string }
  | { kind: 'link'; href: '/trading' | '/finance' | '/tasks' | '/lifestyle'; label: string };

export type Finding = {
  key: string;
  area: 'trading' | 'money' | 'tasks' | 'lifestyle';
  title: string;
  detail: string;
  suggestion: Suggestion;
};

export type Review = {
  mistake: Finding | null;
  wins: { area: Finding['area']; text: string }[];
};

const EMOTION_WORDS: Record<string, string> = {
  fear: 'fearful',
  greed: 'greedy',
  fomo: 'FOMO',
  revenge: 'revenge',
  impatient: 'impatient',
};

const WEEKDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' });

function ruleSuggestion(facts: WeekFacts, template: RuleTemplateKey, label: string): Suggestion {
  const t = RULE_TEMPLATES[template];
  const wanted = 'count' in t.triggerConfig ? (t.triggerConfig.count as number) : null;
  const covered = facts.rules.some(
    (r) =>
      r.enabled &&
      r.triggerType === t.triggerType &&
      (wanted === null || (r.count !== null && r.count <= wanted)),
  );
  return covered
    ? { kind: 'covered', label: `Covered: “${t.name}” (or a stricter rule) is on.` }
    : { kind: 'rule', template, label };
}

function money(minor: bigint, currency: Currency, locale: string): string {
  return formatMoney(minor, currency, { locale });
}

export function analyseWeek(facts: WeekFacts): Review {
  const candidates: { severity: number; finding: Finding }[] = [];
  const { locale } = facts;

  // ---------------------------------------------------------------- trading
  const t = facts.trading;
  if (t && t.worstStreak.count >= 2) {
    candidates.push({
      severity: 100 + t.worstStreak.count,
      finding: {
        key: 'losing-streak',
        area: 'trading',
        title: `${t.worstStreak.count} losing trades in a row on ${WEEKDAY.format(new Date(`${t.worstStreak.day}T12:00:00Z`))}`,
        detail:
          'Losses that follow losses are usually taken at full size. Cutting size after the second loss caps the damage of a bad day.',
        suggestion: ruleSuggestion(
          facts,
          'reduce-risk-after-losses',
          'Add rule: reduce risk after 2 consecutive losses',
        ),
      },
    });
  }
  const costly = t?.costly
    .filter((c) => c.netPnlMinor < 0n)
    .sort((a, b) => (a.netPnlMinor < b.netPnlMinor ? -1 : 1))[0];
  if (t && costly) {
    const word = EMOTION_WORDS[costly.emotion] ?? costly.emotion;
    candidates.push({
      severity: 90,
      finding: {
        key: 'costly-emotion',
        area: 'trading',
        title: `Trades you tagged ${word} lost ${money(-costly.netPnlMinor, t.currency, locale)}`,
        detail: `${costly.trades} trade${costly.trades === 1 ? '' : 's'} this week carried that tag. Write the plan — entry, stop, size — before the order, not after.`,
        suggestion: { kind: 'link', href: '/trading', label: 'Open the trading journal' },
      },
    });
  }

  // ------------------------------------------------------------------ money
  const m = facts.money;
  if (m && m.incomeMinor > 0n && m.expenseMinor > m.incomeMinor) {
    candidates.push({
      severity: 80,
      finding: {
        key: 'overspent',
        area: 'money',
        title: `You spent ${money(m.expenseMinor - m.incomeMinor, m.currency, locale)} more than you earned`,
        detail: m.topCategory
          ? `${m.topCategory.name} was the biggest line at ${money(m.topCategory.spentMinor, m.currency, locale)}. A budget on it makes the next overrun visible the day it happens.`
          : 'A budget on your biggest category makes the next overrun visible the day it happens.',
        suggestion: { kind: 'link', href: '/finance', label: 'Set a budget' },
      },
    });
  }

  // Weekly income is lumpy (a salary lands once a month), so a jump in
  // spending against the week before is the steadier signal.
  if (
    m &&
    m.previousExpenseMinor > 0n &&
    m.expenseMinor * 2n >= m.previousExpenseMinor * 3n &&
    !(m.incomeMinor > 0n && m.expenseMinor > m.incomeMinor)
  ) {
    const up = ratioToPercent(m.expenseMinor - m.previousExpenseMinor, m.previousExpenseMinor);
    candidates.push({
      severity: 75,
      finding: {
        key: 'spending-up',
        area: 'money',
        title: `Spending is up ${up}% on last week`,
        detail: m.topCategory
          ? `${money(m.expenseMinor, m.currency, locale)} out, against ${money(m.previousExpenseMinor, m.currency, locale)} the week before. ${m.topCategory.name} led at ${money(m.topCategory.spentMinor, m.currency, locale)}.`
          : `${money(m.expenseMinor, m.currency, locale)} out, against ${money(m.previousExpenseMinor, m.currency, locale)} the week before.`,
        suggestion: { kind: 'link', href: '/finance', label: 'Set a budget' },
      },
    });
  }

  // ------------------------------------------------------------------ tasks
  const k = facts.tasks;
  if (k.planned >= 3 && k.plannedDone * 2 < k.planned) {
    candidates.push({
      severity: 70,
      finding: {
        key: 'low-completion',
        area: 'tasks',
        title: `You finished ${k.plannedDone} of the ${k.planned} tasks you planned`,
        detail:
          'Plan fewer, finish more. A nudge on days when nothing gets done keeps the list honest.',
        suggestion: ruleSuggestion(
          facts,
          'nudge-when-nothing-done',
          'Add rule: nudge me when nothing is done',
        ),
      },
    });
  }
  if (k.overdueOpen >= 3) {
    candidates.push({
      severity: 60,
      finding: {
        key: 'overdue',
        area: 'tasks',
        title: `${k.overdueOpen} tasks are past their due time`,
        detail: 'Reschedule or delete them — an overdue list stops being read.',
        suggestion: ruleSuggestion(facts, 'flag-overdue-work', 'Add rule: flag overdue work'),
      },
    });
  }

  // -------------------------------------------------------------- lifestyle
  const missed = facts.habits
    .filter((h) => h.target > 0 && h.done * 2 < h.target)
    .sort((a, b) => a.done / a.target - b.done / b.target)[0];
  if (missed) {
    candidates.push({
      severity: 50,
      finding: {
        key: 'habit-missed',
        area: 'lifestyle',
        title: `${missed.name}: ${missed.done} of ${missed.target} this week`,
        detail: 'Shrink it until it fits your worst day, and get warned before a streak breaks.',
        suggestion: ruleSuggestion(facts, 'protect-streaks', 'Add rule: protect my streaks'),
      },
    });
  }

  candidates.sort((a, b) => b.severity - a.severity);

  // ------------------------------------------------------------------- wins
  const wins: Review['wins'] = [];
  if (t && t.closed > 0 && t.netPnlMinor > 0n) {
    wins.push({
      area: 'trading',
      text: `Trading closed up ${money(t.netPnlMinor, t.currency, locale)} on ${t.closed} trade${t.closed === 1 ? '' : 's'}`,
    });
  }
  if (m && m.incomeMinor > 0n && m.expenseMinor < m.incomeMinor) {
    const kept = ratioToPercent(m.incomeMinor - m.expenseMinor, m.incomeMinor);
    if (kept >= 20) wins.push({ area: 'money', text: `You kept ${kept}% of what you earned` });
  }
  if (k.completed >= 5) wins.push({ area: 'tasks', text: `${k.completed} tasks done` });
  const best = facts.habits
    .filter((h) => h.target > 0 && h.done >= h.target)
    .sort((a, b) => b.done - a.done)[0];
  if (best) wins.push({ area: 'lifestyle', text: `${best.name}: ${best.done} of ${best.target}` });

  return { mistake: candidates[0]?.finding ?? null, wins: wins.slice(0, 3) };
}

/** The longest run of consecutive losses, in close order, and the day it ended. */
export function worstLosingStreak(closed: readonly { pnlMinor: bigint; day: string }[]): {
  count: number;
  day: string;
} {
  let best = { count: 0, day: '' };
  let run = 0;
  for (const trade of closed) {
    if (trade.pnlMinor < 0n) {
      run += 1;
      if (run > best.count) best = { count: run, day: trade.day };
    } else {
      run = 0;
    }
  }
  return best;
}
