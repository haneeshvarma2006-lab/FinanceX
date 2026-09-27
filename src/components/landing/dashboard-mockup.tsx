import {
  CandlestickChart,
  Check,
  Lightbulb,
  LayoutGrid,
  ListChecks,
  Target,
  Wallet,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { AllocationBar, AreaChart, TradeBars } from './charts';
import {
  allocation,
  EXAMPLE_NOTE,
  insights,
  netWorthSeries,
  netWorthStats,
  todaysTasks,
  tradeResults,
  tradeStats,
} from './data';
import { TONE_DOT } from './primitives';

/**
 * The hero dashboard: what the product looks like on a good morning.
 *
 * Built from real markup and the same chart primitives as the rest of the
 * page, so it is sharp at any size, readable by assistive tech, and —
 * because every widget maps to something the app does — honest about what
 * you get. It says "Example data" in its own title bar.
 */

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const MONTHS = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];

function Panel({
  title,
  aside,
  children,
  className,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'flex min-w-0 flex-col gap-3 rounded-xl border border-brand-line/80 bg-brand-canvas/50 p-3.5',
        className,
      )}
    >
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-2xs font-medium tracking-wide text-brand-ink-muted uppercase">
          {title}
        </h3>
        {aside}
      </header>
      {children}
    </section>
  );
}

function NetWorth() {
  return (
    <Panel
      title="Net worth"
      className="col-span-6 sm:col-span-4"
      aside={<span className="text-2xs text-brand-ink-subtle">12 months</span>}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="font-figures text-2xl font-medium tracking-tight text-brand-ink tabular-nums sm:text-3xl">
          {inr.format(netWorthStats.current)}
        </p>
        <p className="font-figures text-xs text-brand-finance tabular-nums">
          +{inr.format(netWorthStats.monthChange)} · +{netWorthStats.monthChangePct.toFixed(1)}%
          <span className="ml-1 text-brand-ink-subtle">this month</span>
        </p>
      </div>
      <AreaChart
        values={netWorthSeries}
        tone="finance"
        height={96}
        label={`Net worth over twelve months, rising to ${inr.format(netWorthStats.current)}`}
        className="h-24"
      />
      <div aria-hidden className="flex justify-between text-3xs text-brand-ink-subtle">
        {MONTHS.filter((_, i) => i % 2 === 0).map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
    </Panel>
  );
}

function Portfolio() {
  return (
    <Panel title="Portfolio" className="col-span-6 hidden sm:col-span-2 sm:flex">
      <p className="font-figures text-lg font-medium text-brand-ink tabular-nums">4 assets</p>
      <AllocationBar parts={allocation} columns={1} />
    </Panel>
  );
}

function Tasks() {
  const open = todaysTasks.filter((t) => !t.done).length;
  return (
    <Panel
      title="Today's tasks"
      className="col-span-6 sm:col-span-3"
      aside={
        <span className="font-figures text-2xs text-brand-ink-subtle tabular-nums">
          {open} open
        </span>
      }
    >
      <ul className="flex flex-col gap-1">
        {todaysTasks.map((task) => (
          <li key={task.title} className="flex items-center gap-2.5 rounded-md py-1">
            <span
              aria-hidden
              className={cn(
                'inline-flex size-3.5 shrink-0 items-center justify-center rounded-full border',
                task.done
                  ? 'border-brand-finance bg-brand-finance text-brand-canvas'
                  : 'border-brand-ink-subtle',
              )}
            >
              {task.done && <Check className="size-2.5" strokeWidth={3} />}
            </span>
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-xs',
                task.done ? 'text-brand-ink-subtle line-through' : 'text-brand-ink',
              )}
            >
              {task.title}
            </span>
            <span
              aria-hidden
              className={cn('size-1.5 shrink-0 rounded-full', TONE_DOT[task.tone])}
            />
            <span className="hidden shrink-0 text-3xs text-brand-ink-subtle sm:inline">
              {task.meta}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Trading() {
  return (
    <Panel
      title="Trading · this month"
      className="col-span-6 sm:col-span-3"
      aside={
        <span className="font-figures text-2xs text-brand-ink-subtle tabular-nums">
          {tradeStats.trades} trades
        </span>
      }
    >
      <dl className="grid grid-cols-3 gap-2">
        {[
          ['Win rate', `${tradeStats.winRate}%`],
          ['Profit factor', tradeStats.profitFactor.toFixed(2)],
          ['Realised', `+${inr.format(tradeStats.net)}`],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="truncate text-3xs text-brand-ink-subtle">{label}</dt>
            <dd className="font-figures text-sm font-medium text-brand-ink tabular-nums">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <TradeBars
        results={tradeResults}
        label={`Last ${tradeStats.trades} trades: ${tradeStats.winRate}% winners, including a run of three losses`}
      />
    </Panel>
  );
}

function Insights() {
  return (
    <Panel
      title="Insights"
      className="col-span-6 hidden sm:flex"
      aside={
        <span className="inline-flex items-center gap-1 text-2xs text-brand-ink-subtle">
          <Lightbulb aria-hidden className="size-3" /> From your own records
        </span>
      }
    >
      <ul className="grid gap-2 sm:grid-cols-2">
        {insights.slice(0, 2).map((insight) => (
          <li
            key={insight.title}
            className="relative rounded-lg border border-brand-line/70 bg-brand-card/60 py-2.5 pr-3 pl-4"
          >
            <span
              aria-hidden
              className={cn(
                'absolute inset-y-2.5 left-1.5 w-0.5 rounded-full',
                TONE_DOT[insight.tone],
              )}
            />
            <p className="text-xs font-medium text-brand-ink">{insight.title}</p>
            <p className="mt-0.5 text-2xs text-pretty text-brand-ink-muted">{insight.body}</p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

const NAV = [LayoutGrid, ListChecks, Wallet, CandlestickChart, Target];

export function DashboardMockup() {
  return (
    <figure
      aria-label="The Today dashboard, shown with example data"
      className={cn(
        'relative overflow-hidden rounded-2xl border border-brand-line bg-brand-card/70',
        'shadow-[var(--shadow-sheet),var(--shadow-edge)] backdrop-blur-xl',
      )}
    >
      <span aria-hidden className="lp-border" />
      <div className="flex items-center gap-3 border-b border-brand-line/80 px-4 py-2.5">
        <span aria-hidden className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-brand-line" />
          <span className="size-2.5 rounded-full bg-brand-line" />
          <span className="size-2.5 rounded-full bg-brand-line" />
        </span>
        <span className="flex-1 truncate text-center text-2xs text-brand-ink-subtle">
          Today · Thursday
        </span>
        <span className="rounded-full border border-brand-line px-2 py-0.5 text-3xs text-brand-ink-subtle">
          {EXAMPLE_NOTE.replace(' for illustration', '')}
        </span>
      </div>

      <div className="flex">
        <nav
          aria-hidden
          className="hidden flex-col items-center gap-1 border-r border-brand-line/80 p-2 md:flex"
        >
          {NAV.map((Icon, i) => (
            <span
              key={i}
              className={cn(
                'inline-flex size-8 items-center justify-center rounded-lg',
                i === 0 ? 'bg-brand-tasks/15 text-brand-tasks' : 'text-brand-ink-subtle',
              )}
            >
              <Icon className="size-4" strokeWidth={1.75} />
            </span>
          ))}
        </nav>

        <div className="grid min-w-0 flex-1 grid-cols-6 gap-2.5 p-2.5 sm:gap-3 sm:p-3.5">
          <NetWorth />
          <Portfolio />
          <Tasks />
          <Trading />
          <Insights />
        </div>
      </div>
    </figure>
  );
}
