import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, FileUp, PieChart, Sparkles, Store, Trophy } from 'lucide-react';
import { requireUser } from '@/lib/auth/current-user';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/money';
import { EmptyState } from '@/components/ui/states';
import { formatMoney, type Currency } from '@nestedflow/domain/money';
import { cn } from '@/lib/cn';
import { shortDay } from '@/lib/dates';
import * as repo from '@/modules/finance/repository';
import {
  highlights,
  isMonthKey,
  monthLabel,
  monthRange,
  percentChange,
  share,
  shiftMonth,
  type CategorySpend,
} from '@/modules/finance/insights';
import { todayFor } from '@/modules/dashboard/service';

export const metadata: Metadata = { title: 'Spending insights' };

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requireUser();
  const today = todayFor(user.timezone);
  const thisMonth = today.slice(0, 7);
  const { month: asked } = await searchParams;
  const month = isMonthKey(asked) && asked <= thisMonth ? asked : thisMonth;
  const previous = shiftMonth(month, -1);
  const { from, to } = monthRange(month);
  const before = monthRange(previous);
  const currency = user.baseCurrency as Currency;
  const locale = user.locale || 'en-IN';

  const [totals, lastTotals, byCategory, lastByCategory, payees, largest, categories] =
    await Promise.all([
      repo.totalsIn(user.id, from, to, currency),
      repo.totalsIn(user.id, before.from, before.to, currency),
      repo.spendingByCategoryIn(user.id, from, to, currency),
      repo.spendingByCategoryIn(user.id, before.from, before.to, currency),
      repo.topPayees(user.id, from, to, currency, 8),
      repo.largestExpenses(user.id, from, to, currency, 5),
      repo.listCategories(user.id),
    ]);

  const name = new Map(categories.map((c) => [c.id, c.name]));
  const lastBy = new Map(lastByCategory.map((r) => [r.categoryId, r.spentMinor]));
  const rows: CategorySpend[] = byCategory
    .map((r) => ({
      name: r.categoryId ? (name.get(r.categoryId) ?? 'Category') : 'Not sorted',
      sorted: r.categoryId !== null,
      spentMinor: r.spentMinor,
      previousMinor: lastBy.get(r.categoryId) ?? 0n,
      count: r.count,
    }))
    .sort((a, b) => (b.spentMinor > a.spentMinor ? 1 : b.spentMinor < a.spentMinor ? -1 : 0));

  const money = (minor: bigint) => formatMoney(minor, currency, { locale });
  const label = monthLabel(month, locale);
  const previousLabel = monthLabel(previous, locale).split(' ')[0]!;
  const spent = totals.expenseMinor;
  const notes = highlights({
    categories: rows,
    spentMinor: spent,
    incomeMinor: totals.incomeMinor,
    previousSpentMinor: lastTotals.expenseMinor,
    previousLabel,
    money,
  });
  const overall = percentChange(spent, lastTotals.expenseMinor);
  const biggest = rows[0]?.spentMinor ?? 0n;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Money"
        accent="finance"
        icon={<PieChart />}
        title="Where your money went"
        description="Your spending by category, who you paid most and what changed, from what you recorded or imported."
      />

      <nav aria-label="Month" className="flex items-center justify-between gap-3">
        <Link
          href={`/finance/insights?month=${previous}`}
          aria-label={`Previous month, ${monthLabel(previous, locale)}`}
          className="inline-flex size-10 items-center justify-center rounded-full border border-border-subtle bg-surface-overlay text-text-secondary hover:text-text-primary"
        >
          <ChevronLeft aria-hidden className="size-4" />
        </Link>
        <p className="text-base font-semibold text-text-primary" aria-live="polite">
          {label}
        </p>
        {month < thisMonth ? (
          <Link
            href={`/finance/insights?month=${shiftMonth(month, 1)}`}
            aria-label={`Next month, ${monthLabel(shiftMonth(month, 1), locale)}`}
            className="inline-flex size-10 items-center justify-center rounded-full border border-border-subtle bg-surface-overlay text-text-secondary hover:text-text-primary"
          >
            <ChevronRight aria-hidden className="size-4" />
          </Link>
        ) : (
          <span aria-hidden className="size-10" />
        )}
      </nav>

      {spent === 0n && totals.incomeMinor === 0n ? (
        <Card accent="finance">
          <EmptyState
            icon={<FileUp aria-hidden className="size-5" />}
            title={`Nothing recorded for ${label}`}
            description="Upload that month's bank statement PDF and every payment lands here, sorted into categories."
            action={
              <Link
                href="/finance/import"
                className="inline-flex h-10 items-center gap-2 rounded-full bg-text-primary px-4 text-sm font-medium text-surface-sunken"
              >
                <FileUp aria-hidden className="size-4" />
                Import a statement
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          <section aria-label={`${label} in numbers`} className="grid grid-cols-3 gap-2 sm:gap-3">
            <Stat label="Spent" value={money(spent)} tone="negative">
              {overall !== null && (
                <>
                  {overall >= 0 ? '▲' : '▼'} {Math.abs(Math.round(overall))}% vs {previousLabel}
                </>
              )}
            </Stat>
            <Stat label="Came in" value={money(totals.incomeMinor)} tone="positive" />
            <Stat
              label={totals.incomeMinor >= spent ? 'Left over' : 'Overspent'}
              value={money(
                totals.incomeMinor >= spent
                  ? totals.incomeMinor - spent
                  : spent - totals.incomeMinor,
              )}
              tone={totals.incomeMinor >= spent ? 'positive' : 'negative'}
            />
          </section>

          {notes.length > 0 && (
            <Card accent="finance">
              <CardHeader
                title="In short"
                accent="finance"
                icon={<Sparkles className="size-4" />}
              />
              <CardBody>
                <ul className="flex flex-col gap-2.5">
                  {notes.map((note) => (
                    <li key={note} className="flex gap-2.5 text-sm text-pretty text-text-primary">
                      <span
                        aria-hidden
                        className="mt-2 size-1.5 shrink-0 rounded-full bg-finance"
                      />
                      {note}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          {rows.length > 0 && (
            <Card accent="finance" labelledBy="insights-categories">
              <CardHeader
                id="insights-categories"
                title="By category"
                accent="finance"
                icon={<PieChart className="size-4" />}
                description={`${rows.length} categor${rows.length === 1 ? 'y' : 'ies'} · ${money(spent)}`}
              />
              <ul className="divide-y divide-border-subtle/70">
                {rows.map((row) => {
                  const change = percentChange(row.spentMinor, row.previousMinor);
                  return (
                    <li key={row.name} className="flex flex-col gap-2 px-5 py-3.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <p
                          className={cn(
                            'min-w-0 truncate text-sm font-medium',
                            row.sorted ? 'text-text-primary' : 'text-text-muted',
                          )}
                        >
                          <span>{row.name}</span>
                          <span className="ml-2 text-xs font-normal text-text-muted">
                            {row.count} payment{row.count === 1 ? '' : 's'}
                          </span>
                        </p>
                        <p className="numeric shrink-0 text-sm font-semibold text-text-primary">
                          {money(row.spentMinor)}
                        </p>
                      </div>
                      <div
                        role="img"
                        aria-label={`${Math.round(share(row.spentMinor, spent))}% of spending`}
                        className="h-2 overflow-hidden rounded-full bg-surface-sunken"
                      >
                        <div
                          className={cn(
                            'h-full rounded-full',
                            row.sorted ? 'bg-finance' : 'bg-text-muted/40',
                          )}
                          style={{
                            width: `${Math.max(2, share(row.spentMinor, biggest))}%`,
                          }}
                        />
                      </div>
                      <p className="flex justify-between gap-2 text-xs text-text-muted">
                        <span className="numeric">
                          {Math.round(share(row.spentMinor, spent))}% of spending
                        </span>
                        <span
                          className={cn(
                            'numeric',
                            change !== null && change >= 20 && 'text-warning',
                            change !== null && change <= -20 && 'text-positive',
                          )}
                        >
                          {change === null
                            ? row.previousMinor === 0n && lastTotals.expenseMinor > 0n
                              ? `New since ${previousLabel}`
                              : ''
                            : `${change >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(change))}% vs ${previousLabel}`}
                        </span>
                      </p>
                    </li>
                  );
                })}
              </ul>
              {rows.some((r) => !r.sorted) && (
                <p className="border-t border-border-subtle/70 px-5 py-3 text-xs text-text-muted">
                  Give unsorted payments a category on{' '}
                  <Link href="/finance" className="text-text-secondary underline">
                    Finance
                  </Link>
                  , or pick one on the preview the next time you import.
                </p>
              )}
            </Card>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            {payees.length > 0 && (
              <Card accent="finance" labelledBy="insights-payees">
                <CardHeader
                  id="insights-payees"
                  title="Where you spent most"
                  accent="finance"
                  icon={<Store className="size-4" />}
                />
                <ol className="divide-y divide-border-subtle/70">
                  {payees.map((p, i) => (
                    <li key={p.name} className="flex items-center gap-3 px-5 py-3">
                      <span className="numeric w-4 shrink-0 text-xs text-text-muted">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-text-primary">{p.name}</p>
                        <p className="text-xs text-text-muted">
                          {p.count} payment{p.count === 1 ? '' : 's'}
                        </p>
                      </div>
                      <span className="numeric shrink-0 text-sm text-text-primary">
                        {money(p.spentMinor)}
                      </span>
                    </li>
                  ))}
                </ol>
              </Card>
            )}

            {largest.length > 0 && (
              <Card accent="finance" labelledBy="insights-largest">
                <CardHeader
                  id="insights-largest"
                  title="Biggest payments"
                  accent="finance"
                  icon={<Trophy className="size-4" />}
                />
                <ul className="divide-y divide-border-subtle/70">
                  {largest.map((tx) => (
                    <li key={tx.id} className="flex items-center gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-text-primary">{tx.description}</p>
                        <p className="text-xs text-text-muted">
                          {shortDay(tx.occurredOn, today)}
                          {tx.categoryId && name.get(tx.categoryId)
                            ? ` · ${name.get(tx.categoryId)}`
                            : ''}
                        </p>
                      </div>
                      <span className="numeric shrink-0 text-sm text-negative">
                        {money(-tx.amountMinor)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>

          <p className="text-xs text-pretty text-text-muted">
            Only {currency} accounts are counted. Transfers between your own accounts are not
            spending.
          </p>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  children,
}: {
  label: string;
  value: string;
  tone: 'positive' | 'negative';
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl border border-border-subtle bg-surface-raised p-3 shadow-(--shadow-edge) sm:p-4">
      <p className="text-2xs font-medium tracking-wide text-text-muted uppercase">{label}</p>
      <p
        className={cn(
          'numeric text-sm font-semibold tracking-tight break-all sm:text-2xl',
          tone === 'positive' ? 'text-positive' : 'text-negative',
        )}
      >
        {value}
      </p>
      {children && <p className="numeric text-2xs text-text-muted">{children}</p>}
    </div>
  );
}
