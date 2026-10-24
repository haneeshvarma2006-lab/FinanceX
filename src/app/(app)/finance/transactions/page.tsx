import { Fragment } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Download, ListFilter, Receipt, Rows3, Search } from 'lucide-react';
import { requireUser } from '@/lib/auth/current-user';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, SelectField } from '@/components/ui/form';
import { Money, PageHeader } from '@/components/ui/money';
import { Pagination } from '@/components/ui/pagination';
import { EmptyState } from '@/components/ui/states';
import { formatMoney, isCurrency, type Currency } from '@nestedflow/domain/money';
import { shortDay } from '@/lib/dates';
import { paginate, paginationSchema } from '@/lib/query';
import { todayFor } from '@/modules/dashboard/service';
import { AUTO_CATEGORIES } from '@/modules/finance/categorize';
import { ledgerFilter, ledgerParamsSchema, ledgerQuery } from '@/modules/finance/ledger';
import { SUGGESTED_CATEGORIES } from '@/modules/finance/recurring';
import * as repo from '@/modules/finance/repository';
import { monthLabel, shiftMonth } from '@/modules/finance/insights';
import { DeleteTransactionButton } from '../forms';
import { CategoryPicker } from './category-picker';

export const metadata: Metadata = { title: 'All transactions' };

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const raw = await searchParams;
  const flat = Object.fromEntries(
    Object.entries(raw).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v]] : [])),
  );
  const params = ledgerParamsSchema.parse(flat);
  const pagination = paginationSchema.parse({ ...flat, pageSize: flat.pageSize ?? 50 });
  const filter = ledgerFilter(params);
  const today = todayFor(user.timezone);
  const locale = user.locale || 'en-IN';

  const [rows, summary, accounts, categories] = await Promise.all([
    repo.searchLedger(
      user.id,
      filter,
      pagination.pageSize,
      (pagination.page - 1) * pagination.pageSize,
    ),
    repo.ledgerTotals(user.id, filter),
    repo.listAccounts(user.id, true),
    repo.listCategories(user.id),
  ]);
  const bills = await repo.billIdsForTransactions(
    user.id,
    rows.map((r) => r.id),
  );

  const page = paginate(rows, summary.count, pagination);
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const expenseCategories = categories.filter((c) => c.kind === 'expense' && !c.archivedAt);
  const options = [
    ...new Set([
      ...expenseCategories.map((c) => c.name),
      ...SUGGESTED_CATEGORIES,
      ...AUTO_CATEGORIES,
    ]),
  ].sort((a, b) => a.localeCompare(b));
  const filtered = Boolean(
    params.q || params.month || params.category || params.account || params.direction,
  );
  const months = Array.from({ length: 13 }, (_, i) => shiftMonth(today.slice(0, 7), -i));
  const money = (minor: bigint, currency: string) =>
    isCurrency(currency) ? formatMoney(minor, currency, { locale }) : `${minor} ${currency}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Money"
        accent="finance"
        icon={<Rows3 />}
        title="All transactions"
        description="Search, filter and fix any payment. Download what you see as a spreadsheet."
        action={
          <a
            href={`/finance/transactions/export${ledgerQuery(params)}`}
            download
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full border border-border-subtle bg-surface-overlay px-4 text-sm font-medium text-text-primary shadow-(--shadow-edge) hover:border-border-strong sm:w-auto"
          >
            <Download aria-hidden className="size-4" />
            Download CSV
          </a>
        }
      />

      <Card accent="finance">
        <CardBody>
          <form
            method="get"
            role="search"
            aria-label="Filter transactions"
            className="flex flex-col gap-4"
          >
            <Field
              label="Search"
              name="q"
              type="search"
              defaultValue={params.q ?? ''}
              placeholder="Swiggy, rent, a name…"
              maxLength={80}
            />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <SelectField label="Month" name="month" defaultValue={params.month ?? ''}>
                <option value="">Any month</option>
                {months.map((m) => (
                  <option key={m} value={m}>
                    {monthLabel(m, locale)}
                  </option>
                ))}
              </SelectField>
              <SelectField label="Category" name="category" defaultValue={params.category ?? ''}>
                <option value="">Any category</option>
                <option value="none">Not sorted</option>
                {categories
                  .filter((c) => !c.archivedAt)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </SelectField>
              <SelectField label="Account" name="account" defaultValue={params.account ?? ''}>
                <option value="">Any account</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </SelectField>
              <SelectField label="Money" name="direction" defaultValue={params.direction ?? ''}>
                <option value="">In and out</option>
                <option value="out">Money out</option>
                <option value="in">Money in</option>
              </SelectField>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                className="inline-flex h-10 items-center gap-2 rounded-full bg-text-primary px-5 text-sm font-medium text-surface-sunken"
              >
                <Search aria-hidden className="size-4" />
                Show
              </button>
              {filtered && (
                <Link
                  href="/finance/transactions"
                  className="inline-flex h-10 items-center rounded-full px-4 text-sm text-text-secondary hover:text-text-primary"
                >
                  Clear filters
                </Link>
              )}
            </div>
          </form>
        </CardBody>
      </Card>

      <Card accent="finance" labelledBy="ledger-results">
        <CardHeader
          id="ledger-results"
          title={filtered ? 'Matching transactions' : 'Every transaction'}
          accent="finance"
          icon={<ListFilter className="size-4" />}
          description={[
            `${summary.count} transaction${summary.count === 1 ? '' : 's'}`,
            ...summary.totals.flatMap((t) => [
              ...(t.outMinor > 0n ? [`${money(t.outMinor, t.currency)} out`] : []),
              ...(t.inMinor > 0n ? [`${money(t.inMinor, t.currency)} in`] : []),
            ]),
          ].join(' · ')}
        />
        {page.items.length === 0 ? (
          <EmptyState
            icon={<Search aria-hidden className="size-5" />}
            title={filtered ? 'Nothing matches' : 'No transactions yet'}
            description={
              filtered
                ? 'Try other words, or clear the filters.'
                : 'Add one on Finance, or import a bank statement PDF to bring in a whole month at once.'
            }
          />
        ) : (
          <ul className="divide-y divide-border-subtle/70">
            {page.items.map((tx, i) => (
              <Fragment key={tx.id}>
                {/* A heading wherever the month changes, so a long list scans by month. */}
                {(i === 0 ||
                  page.items[i - 1]!.occurredOn.slice(0, 7) !== tx.occurredOn.slice(0, 7)) && (
                  <li
                    aria-hidden
                    className="bg-surface-sunken/60 px-5 py-1.5 text-2xs font-medium tracking-wide text-text-muted uppercase"
                  >
                    {monthLabel(tx.occurredOn.slice(0, 7), locale)}
                  </li>
                )}
                <li className="flex items-start gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-text-primary" title={tx.notes ?? undefined}>
                      {tx.description}
                    </p>
                    <p className="numeric mt-0.5 text-xs text-text-muted">
                      {shortDay(tx.occurredOn, today)} ·{' '}
                      {accountName.get(tx.accountId) ?? 'Account'}
                      {tx.kind !== 'expense' && tx.categoryId
                        ? ` · ${categoryName.get(tx.categoryId) ?? ''}`
                        : ''}
                      {tx.kind === 'transfer' ? ' · Transfer' : ''}
                    </p>
                    {tx.kind === 'expense' && (
                      <div className="mt-1.5">
                        <CategoryPicker
                          id={tx.id}
                          label={`${tx.description} on ${tx.occurredOn}`}
                          value={tx.categoryId ? (categoryName.get(tx.categoryId) ?? null) : null}
                          options={options}
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {bills.has(tx.id) && (
                      <Link
                        href={`/finance/bills/${bills.get(tx.id)}`}
                        aria-label={`Bill photo for ${tx.description}`}
                        className="inline-flex size-7 items-center justify-center rounded-full text-text-muted hover:bg-surface-raised hover:text-text-primary"
                      >
                        <Receipt aria-hidden className="size-3.5" />
                      </Link>
                    )}
                    <Money minor={tx.amountMinor} currency={tx.currency as Currency} signed />
                    <DeleteTransactionButton id={tx.id} />
                  </div>
                </li>
              </Fragment>
            ))}
          </ul>
        )}
        {page.totalPages > 1 && (
          <CardBody className="border-t border-border-subtle">
            <Pagination page={page} />
          </CardBody>
        )}
      </Card>
    </div>
  );
}
