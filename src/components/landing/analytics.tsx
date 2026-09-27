import { Lightbulb } from 'lucide-react';
import { cn } from '@/lib/cn';
import { AreaChart, Meter, Sparkline, TradeBars } from './charts';
import {
  EXAMPLE_NOTE,
  insights,
  monthlySavings,
  netWorthSeries,
  netWorthStats,
  tradeResults,
  tradeStats,
} from './data';
import { Counter, FadeUp, GlowCard } from './motion';
import { Container, SectionHeader, TONE_DOT } from './primitives';

const MONTHS = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];
const TASK_COMPLETION = 87;

function Stat({
  label,
  children,
  visual,
  className,
}: {
  label: string;
  children: React.ReactNode;
  visual: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-3 p-5', className)}>
      <p className="text-xs text-brand-ink-muted">{label}</p>
      <div className="text-2xl font-medium tracking-tight text-brand-ink">{children}</div>
      {visual}
    </div>
  );
}

export function Analytics() {
  const latestSavings = monthlySavings[monthlySavings.length - 1]!;

  return (
    <section id="analytics" className="scroll-mt-20 py-24 sm:py-32">
      <Container className="flex flex-col gap-14">
        <FadeUp>
          <SectionHeader
            eyebrow="Analytics"
            title={
              <>
                See the <em>whole</em> picture.
              </>
            }
            body="Your net worth, your savings rate, your follow-through and your edge — measured side by side, because they were never really separate."
          />
        </FadeUp>

        <div className="grid gap-4 lg:grid-cols-12">
          <FadeUp className="lg:col-span-8">
            <GlowCard tone="finance" className="h-full">
              <div className="flex h-full flex-col gap-6 p-6 sm:p-8">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="text-xs text-brand-ink-muted">Net worth growth · 12 months</p>
                    <p className="mt-2 text-4xl font-medium tracking-tighter text-brand-ink sm:text-5xl">
                      <Counter value={netWorthStats.yearGrowthPct} format="signedPercent" />
                    </p>
                  </div>
                  <p className="text-right text-xs text-brand-ink-muted">
                    Now{' '}
                    <Counter
                      value={netWorthStats.current}
                      format="inr"
                      className="text-brand-ink"
                    />
                  </p>
                </div>
                <div className="mt-auto">
                  <AreaChart
                    values={netWorthSeries}
                    tone="finance"
                    height={200}
                    className="h-48 sm:h-56"
                    label={`Net worth over twelve months, up ${netWorthStats.yearGrowthPct.toFixed(1)} percent`}
                  />
                  <div
                    aria-hidden
                    className="mt-3 flex justify-between text-3xs text-brand-ink-subtle"
                  >
                    {MONTHS.map((m) => (
                      <span key={m}>{m}</span>
                    ))}
                  </div>
                </div>
              </div>
            </GlowCard>
          </FadeUp>

          <FadeUp delay={0.08} className="lg:col-span-4">
            <GlowCard tone="neutral" className="h-full">
              <div className="flex h-full flex-col divide-y divide-brand-line/70">
                <Stat
                  label="Saved this month"
                  visual={
                    <Sparkline
                      values={monthlySavings}
                      tone="finance"
                      label="Monthly savings over seven months, trending up"
                    />
                  }
                >
                  <Counter value={latestSavings} format="inr" />
                </Stat>
                <Stat
                  label="Tasks completed on time"
                  visual={
                    <Meter
                      value={TASK_COMPLETION}
                      tone="tasks"
                      label={`${TASK_COMPLETION} percent of tasks completed on time`}
                    />
                  }
                >
                  <Counter value={TASK_COMPLETION} format="percent" />
                </Stat>
                <Stat
                  label="Trading win rate"
                  visual={
                    <TradeBars
                      results={tradeResults}
                      label={`Win rate ${tradeStats.winRate} percent across ${tradeStats.trades} trades`}
                    />
                  }
                >
                  <Counter value={tradeStats.winRate} format="percent" />
                  <span className="ml-2 text-xs text-brand-ink-subtle">
                    PF{' '}
                    <span className="font-figures tabular-nums">
                      {tradeStats.profitFactor.toFixed(2)}
                    </span>
                  </span>
                </Stat>
              </div>
            </GlowCard>
          </FadeUp>

          <FadeUp delay={0.12} className="lg:col-span-12">
            <GlowCard tone="tasks">
              <div className="flex flex-col gap-5 p-6 sm:p-8">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="inline-flex items-center gap-2 text-base font-semibold text-brand-ink">
                    <Lightbulb aria-hidden className="size-4 text-brand-tasks" /> Recommendations
                  </h3>
                  <p className="text-xs text-brand-ink-subtle">
                    Drawn from your own records, never invented
                  </p>
                </div>
                <ul className="grid gap-3 md:grid-cols-3">
                  {insights.map((insight) => (
                    <li
                      key={insight.title}
                      className="relative rounded-xl border border-brand-line/80 bg-brand-canvas/50 py-4 pr-4 pl-5"
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'absolute inset-y-4 left-2 w-0.5 rounded-full',
                          TONE_DOT[insight.tone],
                        )}
                      />
                      <p className="text-sm font-medium text-brand-ink">{insight.title}</p>
                      <p className="mt-1 text-xs text-pretty text-brand-ink-muted">
                        {insight.body}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            </GlowCard>
          </FadeUp>
        </div>

        <p className="text-center text-2xs text-brand-ink-subtle">{EXAMPLE_NOTE}</p>
      </Container>
    </section>
  );
}
