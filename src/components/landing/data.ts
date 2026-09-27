/**
 * Everything the landing page says and shows, in one place.
 *
 * The figures are EXAMPLES, and the page labels them as such wherever they
 * appear. They are chosen to look like one plausible person's month — modest
 * returns, a real losing streak, a budget slightly over — because a marketing
 * page full of impossible numbers is exactly the kind of misleading financial
 * claim this product promises not to make. Nothing here is a user's data, a
 * performance record, or a promise of results.
 */

export const EXAMPLE_NOTE = 'Example data for illustration';

/** Twelve months of net worth, in rupees. */
export const netWorthSeries = [
  2140000, 2175000, 2200000, 2185000, 2240000, 2275000, 2310000, 2360000, 2345000, 2400000, 2430000,
  2486400,
] as const;

/** The last twelve closed trades, realised P&L in rupees. Includes a losing streak. */
export const tradeResults = [
  2400, 3100, -2400, 4200, -1900, -2600, -2200, 2800, 3600, -3600, 1900, 2640,
] as const;

/**
 * Trading statistics DERIVED from the trades above, never typed in, so the
 * win rate, profit factor and P&L on the page can never disagree.
 */
export const tradeStats = (() => {
  const wins = tradeResults.filter((r) => r > 0);
  const losses = tradeResults.filter((r) => r < 0);
  const grossWin = wins.reduce((a, b) => a + b, 0);
  const grossLoss = -losses.reduce((a, b) => a + b, 0);
  return {
    trades: tradeResults.length,
    winRate: Math.round((wins.length / tradeResults.length) * 100),
    profitFactor: grossWin / grossLoss,
    net: grossWin - grossLoss,
  };
})();

const last = netWorthSeries[netWorthSeries.length - 1]!;
const previous = netWorthSeries[netWorthSeries.length - 2]!;
const first = netWorthSeries[0]!;

/** Also derived: this month's change and the twelve-month growth. */
export const netWorthStats = {
  current: last,
  monthChange: last - previous,
  monthChangePct: ((last - previous) / previous) * 100,
  yearGrowthPct: ((last - first) / first) * 100,
};

export const monthlySavings = [31000, 28500, 36000, 33500, 40000, 38200, 42500] as const;

export const todaysTasks = [
  {
    title: 'Review losing trades',
    tone: 'trading',
    meta: 'From a rule',
    done: false,
    priority: 'high',
  },
  {
    title: 'Rebalance SIP allocation',
    tone: 'finance',
    meta: '10:30',
    done: false,
    priority: 'normal',
  },
  {
    title: 'Ship pricing page draft',
    tone: 'tasks',
    meta: 'Due today',
    done: false,
    priority: 'urgent',
  },
  { title: 'Log NIFTY fills', tone: 'trading', meta: 'Done 08:12', done: true, priority: 'normal' },
] as const;

export const insights = [
  {
    tone: 'trading',
    title: 'Three losing trades in a row',
    body: 'All three were breakouts after 2pm. A review task is on Saturday.',
  },
  {
    tone: 'finance',
    title: 'Dining is 18% over budget',
    body: '₹2,160 above plan with nine days left in the month.',
  },
  {
    tone: 'tasks',
    title: 'Emergency fund on pace',
    body: '74% funded. Two more months at this rate.',
  },
] as const;

export const allocation = [
  { label: 'Equity', share: 46, className: 'bg-brand-trading' },
  { label: 'Mutual funds', share: 28, className: 'bg-brand-tasks' },
  { label: 'Cash', share: 18, className: 'bg-brand-finance' },
  { label: 'Gold', share: 8, className: 'bg-brand-ink-subtle' },
] as const;

/**
 * "How it connects" — the part only a combined system can do.
 *
 * Every chain here is something the rules engine does today. "Review after
 * losing trades" is a starter rule that creates the task out of the box; the
 * budget and goal alerts notify by default, and any rule can be set to create
 * a task instead. Tasks are not linked to goals, so no step claims they are.
 * No step is described as AI, because none of it is.
 */
export const flows = [
  {
    id: 'trading',
    tone: 'trading',
    title: 'A losing streak becomes a lesson',
    steps: [
      {
        tone: 'trading',
        icon: 'trendingDown',
        label: 'Third losing trade',
        detail: 'Streak detected from your fills',
      },
      {
        tone: 'tasks',
        icon: 'listChecks',
        label: 'Review task created',
        detail: 'Scheduled for the weekend',
      },
      {
        tone: 'tasks',
        icon: 'calendar',
        label: 'Weekly analysis',
        detail: 'Patterns across the losers',
      },
      {
        tone: 'trading',
        icon: 'target',
        label: 'Strategy refined',
        detail: 'Rules updated, tracked forward',
      },
    ],
  },
  {
    id: 'finance',
    tone: 'finance',
    title: 'An overspend becomes a habit',
    steps: [
      {
        tone: 'finance',
        icon: 'wallet',
        label: 'Budget exceeded',
        detail: 'Dining passes its monthly limit',
      },
      { tone: 'finance', icon: 'bell', label: 'Alert raised', detail: 'The moment it happens' },
      {
        tone: 'tasks',
        icon: 'listChecks',
        label: 'Spending review task',
        detail: 'One rule puts it on your list',
      },
      {
        tone: 'finance',
        icon: 'sprout',
        label: 'Better habits',
        detail: 'Next month lands under plan',
      },
    ],
  },
  {
    id: 'goals',
    tone: 'tasks',
    title: 'A goal becomes a plan',
    steps: [
      { tone: 'tasks', icon: 'flag', label: 'Goal created', detail: '₹3,00,000 emergency fund' },
      {
        tone: 'finance',
        icon: 'activity',
        label: 'Progress tracked',
        detail: 'Every deposit, as a checkpoint',
      },
      {
        tone: 'tasks',
        icon: 'listChecks',
        label: 'Falling behind? Catch-up task',
        detail: 'A rule notices the pace slip',
      },
      { tone: 'finance', icon: 'trophy', label: 'Goal achieved', detail: 'Exact to the paisa' },
    ],
  },
] as const;

export const personas = [
  {
    icon: 'candlestick',
    tone: 'trading',
    who: 'Traders',
    role: 'Active in equities, F&O and crypto',
    line: 'Journal every fill, see your real win rate, and get a review on the calendar after a bad run.',
  },
  {
    icon: 'pieChart',
    tone: 'finance',
    who: 'Investors',
    role: 'Long-term, across every account',
    line: 'Net worth across every account, allocations at a glance, and goals that track themselves.',
  },
  {
    icon: 'rocket',
    tone: 'tasks',
    who: 'Entrepreneurs',
    role: 'Founders, freelancers and operators',
    line: 'Run the business and the personal balance sheet from the same list, without a second app.',
  },
  {
    icon: 'graduationCap',
    tone: 'finance',
    who: 'Students',
    role: 'Starting the habits that compound',
    line: 'Build the habits early: a budget, a savings goal, and a to-do list that respects your money.',
  },
] as const;

/** What people stop juggling. Categories rather than brand names. */
export const replaces = [
  'To-do app',
  'Notes workspace',
  'Budget spreadsheet',
  'Trading journal',
  'Finance app',
] as const;
