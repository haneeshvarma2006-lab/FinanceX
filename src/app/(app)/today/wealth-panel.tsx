import Link from 'next/link';
import { ArrowRight, Gem } from 'lucide-react';
import { formatMoney } from '@nestedflow/domain/money';
import { cn } from '@/lib/cn';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Money } from '@/components/ui/money';
import { Sparkline } from '@/components/ui/sparkline';
import type { Wealth } from '@/modules/dashboard/wealth';

function Tile({
  label,
  children,
  detail,
  className,
}: {
  label: string;
  children: React.ReactNode;
  detail?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <dt className="text-2xs font-medium tracking-wide text-text-muted uppercase">{label}</dt>
      <dd className="flex min-w-0 flex-col gap-2">{children}</dd>
      {detail && <p className="text-xs text-pretty text-text-muted">{detail}</p>}
    </div>
  );
}

const VALUE =
  'stat-roll text-xl leading-tight font-semibold tracking-tight text-text-primary sm:text-2xl';
const EMPTY = 'text-sm text-text-secondary';

const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' });

/**
 * Five figures for the whole system: what you own, what you keep, how far
 * your goals have come, how trading is going and whether planned work gets
 * done. Each says plainly when there is nothing behind it yet.
 */
export function WealthPanel({ wealth, locale }: { wealth: Wealth; locale: string }) {
  const { netWorth, savingsRate, goals, trading, tasks } = wealth;

  return (
    <Card>
      <CardHeader
        title="Wealth"
        description={`In ${wealth.currency}, from your own records`}
        icon={<Gem className="size-4" />}
        action={
          <Link
            href="/review"
            className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
          >
            Weekly review
            <ArrowRight aria-hidden className="size-3" />
          </Link>
        }
      />
      <CardBody>
        <dl className="grid grid-cols-2 gap-x-5 gap-y-6 lg:grid-cols-6">
          <Tile
            label="Net worth"
            className="col-span-2"
            detail={
              netWorth && netWorth.trend.length >= 2
                ? `${MONTH.format(new Date(`${netWorth.trend[0]!.month}-15T12:00:00Z`))} to now`
                : undefined
            }
          >
            {netWorth ? (
              <>
                <span className={cn(VALUE, 'text-3xl sm:text-4xl')}>
                  <Money minor={netWorth.minor} currency={wealth.currency} locale={locale} />
                </span>
                <Sparkline
                  accent="finance"
                  values={netWorth.trend.map((p) => p.minor)}
                  label={`Net worth by month: ${netWorth.trend
                    .map(
                      (p) =>
                        `${MONTH.format(new Date(`${p.month}-15T12:00:00Z`))} ${formatMoney(p.minor, wealth.currency, { locale })}`,
                    )
                    .join(', ')}`}
                  className="max-w-xs"
                />
              </>
            ) : (
              <Link href="/finance" className={cn(EMPTY, 'underline-offset-4 hover:underline')}>
                Add an account to start
              </Link>
            )}
          </Tile>

          <Tile
            label="Savings rate"
            detail={savingsRate ? 'kept of this month’s income' : undefined}
          >
            {savingsRate ? (
              <span className={cn(VALUE, savingsRate.percent < 0 && 'text-negative')}>
                {savingsRate.percent}%
              </span>
            ) : (
              <span className={EMPTY}>No income yet this month</span>
            )}
          </Tile>

          <Tile
            label="Goals"
            detail={goals ? `average of ${goals.active} · ${goals.onTrack} on pace` : undefined}
          >
            {goals ? (
              <span className={VALUE}>{goals.averagePercent}%</span>
            ) : (
              <Link href="/goals" className={cn(EMPTY, 'underline-offset-4 hover:underline')}>
                Set a goal
              </Link>
            )}
          </Tile>

          <Tile
            label="Trading · 30 days"
            detail={
              trading && trading.trades > 0
                ? `${trading.trades} closed · ${trading.winRatePercent}% won`
                : undefined
            }
          >
            {!trading ? (
              <Link href="/trading" className={cn(EMPTY, 'underline-offset-4 hover:underline')}>
                Set up the journal
              </Link>
            ) : trading.trades === 0 ? (
              <span className={EMPTY}>No trades closed</span>
            ) : (
              <>
                <span className={VALUE}>
                  <Money
                    minor={trading.netPnlMinor}
                    currency={trading.currency}
                    locale={locale}
                    signed
                  />
                </span>
                <Sparkline
                  accent="trading"
                  values={trading.curve}
                  label={`Cumulative P&L over the last ${trading.curve.length} closed trades, ending at ${formatMoney(trading.curve[trading.curve.length - 1] ?? 0n, trading.currency, { locale })}`}
                />
              </>
            )}
          </Tile>

          <Tile
            label="Tasks · this week"
            detail={
              tasks.planned > 0
                ? `planned and done · ${tasks.completed} finished in all`
                : `finished · ${tasks.lastWeekCompleted} last week`
            }
          >
            <span className={VALUE}>
              {tasks.planned > 0 ? `${tasks.plannedDone}/${tasks.planned}` : tasks.completed}
            </span>
          </Tile>
        </dl>
      </CardBody>
    </Card>
  );
}
