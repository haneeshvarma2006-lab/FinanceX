import type { ReactNode } from 'react';
import {
  BarChart3,
  CandlestickChart,
  Check,
  Lightbulb,
  ListChecks,
  ShieldAlert,
  Target,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { AreaChart, Meter, Sparkline, type Tone } from './charts';
import { monthlySavings, tradeResults, tradeStats } from './data';
import { FadeUp, GlowCard } from './motion';
import { Container, SectionHeader, TONE_DOT, TONE_SOFT } from './primitives';

/**
 * The feature grid.
 *
 * Every benefit line is something the product does today, checked against the
 * code rather than written as aspiration: P&L is derived from fills, money is
 * stored in integer minor units, recurring tasks schedule their successor,
 * budgets and losing streaks fire rules, accounts are tagged live, paper or
 * backtest.
 */

function Card({
  tone,
  icon: Icon,
  title,
  benefits,
  visual,
  className,
  large = false,
}: {
  tone: Tone | 'neutral';
  icon: LucideIcon;
  title: string;
  benefits: readonly string[];
  visual: ReactNode;
  className?: string;
  large?: boolean;
}) {
  const chip =
    tone === 'neutral' ? 'bg-brand-ink/5 text-brand-ink-muted ring-brand-line' : TONE_SOFT[tone];

  return (
    <GlowCard tone={tone} className={cn('flex flex-col', className)}>
      <div className={cn('relative flex flex-col gap-4', large ? 'p-7 sm:p-8' : 'p-6')}>
        <span
          aria-hidden
          className={cn(
            'inline-flex size-9 items-center justify-center rounded-lg ring-1 ring-inset',
            chip,
          )}
        >
          <Icon className="size-4" strokeWidth={1.75} />
        </span>
        <h3
          className={cn(
            'font-semibold tracking-tight text-brand-ink',
            large ? 'text-2xl' : 'text-lg',
          )}
        >
          {title}
        </h3>
        <ul className="flex flex-col gap-2">
          {benefits.map((benefit) => (
            <li key={benefit} className="flex items-start gap-2 text-sm text-brand-ink-muted">
              <Check
                aria-hidden
                className="mt-0.5 size-3.5 shrink-0 text-brand-ink-subtle"
                strokeWidth={2.5}
              />
              {benefit}
            </li>
          ))}
        </ul>
      </div>
      <div className={cn('relative mt-auto', large ? 'px-7 pb-7 sm:px-8 sm:pb-8' : 'px-6 pb-6')}>
        {visual}
      </div>
    </GlowCard>
  );
}

/** Cumulative P&L from the example trades: the equity curve a journal draws. */
const equityCurve = tradeResults.reduce<number[]>(
  (curve, r) => [...curve, (curve[curve.length - 1] ?? 0) + r],
  [0],
);

const JOURNAL_ROWS = [
  { symbol: 'NIFTY 24500 CE', side: 'Long', r: '+1.8R', pnl: '+₹3,600', win: true },
  { symbol: 'RELIANCE', side: 'Short', r: '−1.0R', pnl: '−₹2,200', win: false },
  { symbol: 'BANKNIFTY FUT', side: 'Long', r: '+1.3R', pnl: '+₹2,640', win: true },
] as const;

function JournalVisual() {
  return (
    <div className="rounded-xl border border-brand-line/80 bg-brand-canvas/60 p-4">
      <div className="mb-3 flex items-center justify-between text-2xs text-brand-ink-subtle">
        <span>Equity curve · last 12 trades</span>
        <span className="font-figures tabular-nums">Example</span>
      </div>
      <AreaChart
        values={equityCurve}
        tone="trading"
        height={160}
        className="h-40"
        label="Cumulative profit and loss over the last twelve example trades, ending higher despite a losing streak"
      />
      <dl className="mt-4 grid grid-cols-3 gap-3 border-y border-brand-line/60 py-3">
        {[
          ['Win rate', `${tradeStats.winRate}%`],
          ['Profit factor', tradeStats.profitFactor.toFixed(2)],
          ['Net P&L', `+₹${tradeStats.net.toLocaleString('en-IN')}`],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-3xs text-brand-ink-subtle">{label}</dt>
            <dd className="font-figures text-sm text-brand-ink tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <table className="mt-3 w-full text-left text-xs">
        <caption className="sr-only">Recent example trades</caption>
        <thead>
          <tr className="text-3xs tracking-wide text-brand-ink-subtle uppercase">
            <th className="pb-2 font-medium">Instrument</th>
            <th className="pb-2 font-medium">Side</th>
            <th className="pb-2 text-right font-medium">R</th>
            <th className="pb-2 text-right font-medium">P&amp;L</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-brand-line/60">
          {JOURNAL_ROWS.map((row) => (
            <tr key={row.symbol}>
              <td className="py-2 text-brand-ink">{row.symbol}</td>
              <td className="py-2 text-brand-ink-muted">{row.side}</td>
              <td className="py-2 text-right font-figures text-brand-ink-muted tabular-nums">
                {row.r}
              </td>
              <td
                className={cn(
                  'py-2 text-right font-figures tabular-nums',
                  row.win ? 'text-brand-finance' : 'text-brand-trading',
                )}
              >
                {row.pnl}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const BUDGETS = [
  { label: 'Rent', used: 100, note: '₹28,000 of ₹28,000' },
  { label: 'Groceries', used: 72, note: '₹7,200 of ₹10,000' },
  { label: 'Dining', used: 118, note: '₹14,160 of ₹12,000' },
] as const;

function BudgetVisual() {
  return (
    <ul className="flex flex-col gap-3 rounded-xl border border-brand-line/80 bg-brand-canvas/60 p-4">
      {BUDGETS.map((b) => (
        <li key={b.label} className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-brand-ink">{b.label}</span>
            <span
              className={cn(
                'font-figures text-2xs tabular-nums',
                b.used > 100 ? 'text-warning' : 'text-brand-ink-subtle',
              )}
            >
              {b.used > 100 ? `Over · ${b.note}` : b.note}
            </span>
          </div>
          <Meter
            value={b.used}
            tone="finance"
            over={b.used > 100}
            label={`${b.label} budget ${b.used}% used`}
          />
        </li>
      ))}
    </ul>
  );
}

const TASKS = [
  { title: 'Review losing breakouts', tone: 'trading', tag: 'From a rule' },
  { title: 'Pay credit card', tone: 'finance', tag: 'Repeats monthly' },
  { title: 'Draft investor update', tone: 'tasks', tag: 'Urgent' },
] as const;

function TaskVisual() {
  return (
    <ul className="flex flex-col divide-y divide-brand-line/60 rounded-xl border border-brand-line/80 bg-brand-canvas/60 px-4">
      {TASKS.map((t) => (
        <li key={t.title} className="flex items-center gap-3 py-2.5">
          <span
            aria-hidden
            className="size-3.5 shrink-0 rounded-full border border-brand-ink-subtle"
          />
          <span className="min-w-0 flex-1 truncate text-xs text-brand-ink">{t.title}</span>
          <span className="inline-flex shrink-0 items-center gap-1.5 text-3xs text-brand-ink-subtle">
            <span aria-hidden className={cn('size-1.5 rounded-full', TONE_DOT[t.tone])} />
            {t.tag}
          </span>
        </li>
      ))}
    </ul>
  );
}

function SmallVisual({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-brand-line/80 bg-brand-canvas/60 p-3">{children}</div>
  );
}

export function FeatureBento() {
  return (
    <section id="features" className="scroll-mt-20 py-24 sm:py-32">
      <Container className="flex flex-col gap-14">
        <FadeUp>
          <SectionHeader
            eyebrow="The product"
            title="Three tools, one mind."
            body="A trading journal, a finance tracker and a task manager — built as one system, so each makes the others smarter."
          />
        </FadeUp>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12">
          <FadeUp className="md:col-span-2 lg:col-span-7 lg:row-span-2">
            <Card
              large
              tone="trading"
              icon={CandlestickChart}
              title="Trading Journal"
              className="h-full"
              benefits={[
                'P&L derived from your fills, fees included — never typed in',
                'Win rate, profit factor and drawdown, by strategy',
                'Live, paper and backtest accounts kept strictly apart',
              ]}
              visual={<JournalVisual />}
            />
          </FadeUp>

          <FadeUp delay={0.05} className="lg:col-span-5">
            <Card
              tone="finance"
              icon={Wallet}
              title="Finance Tracker"
              className="h-full"
              benefits={[
                'Every account in one ledger, transfers that always balance',
                'Budgets that tell you the moment you pass them',
                'Exact to the paisa — money is never rounded',
              ]}
              visual={<BudgetVisual />}
            />
          </FadeUp>

          <FadeUp delay={0.1} className="lg:col-span-5">
            <Card
              tone="tasks"
              icon={ListChecks}
              title="Task Manager"
              className="h-full"
              benefits={[
                'Recurring tasks that schedule their own next one',
                'Priorities you can scan without reading',
                'Tasks raised by your money and your trades',
              ]}
              visual={<TaskVisual />}
            />
          </FadeUp>

          {(
            [
              {
                tone: 'tasks',
                icon: Lightbulb,
                title: 'Insights',
                benefits: ['Signals from your own records', 'Never an invented number'],
                visual: (
                  <SmallVisual>
                    <p className="text-2xs text-brand-ink">Dining is 18% over budget</p>
                    <p className="mt-0.5 text-3xs text-brand-ink-subtle">
                      Nine days left this month
                    </p>
                  </SmallVisual>
                ),
              },
              {
                tone: 'trading',
                icon: ShieldAlert,
                title: 'Risk Tracking',
                benefits: ['Risk per trade, set per account', 'Drawdown measured from your fills'],
                visual: (
                  <SmallVisual>
                    <div className="mb-1.5 flex justify-between text-3xs text-brand-ink-subtle">
                      <span>Risk per trade</span>
                      <span className="font-figures tabular-nums">1.0%</span>
                    </div>
                    <Meter
                      value={33}
                      tone="trading"
                      label="Risk per trade at one percent of a three percent ceiling"
                    />
                  </SmallVisual>
                ),
              },
              {
                tone: 'finance',
                icon: Target,
                title: 'Goal System',
                benefits: ['Savings, numeric and habit goals', 'Told when you fall off pace'],
                visual: (
                  <SmallVisual>
                    <div className="mb-1.5 flex justify-between text-3xs text-brand-ink-subtle">
                      <span>Emergency fund</span>
                      <span className="font-figures tabular-nums">74%</span>
                    </div>
                    <Meter
                      value={74}
                      tone="finance"
                      label="Emergency fund goal 74 percent complete"
                    />
                  </SmallVisual>
                ),
              },
              {
                tone: 'neutral',
                icon: BarChart3,
                title: 'Analytics',
                benefits: ['Net worth across every account', 'Performance by strategy'],
                visual: (
                  <SmallVisual>
                    <Sparkline
                      values={monthlySavings}
                      tone="finance"
                      label="Monthly savings trending upward"
                    />
                  </SmallVisual>
                ),
              },
            ] as const
          ).map((card, i) => (
            <FadeUp key={card.title} delay={0.05 * i} className="lg:col-span-3">
              <Card {...card} className="h-full" />
            </FadeUp>
          ))}
        </div>
      </Container>
    </section>
  );
}
