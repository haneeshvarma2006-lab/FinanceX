import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowLeftRight,
  CalendarClock,
  FileUp,
  PieChart,
  Receipt,
  ScanLine,
  Wallet,
} from 'lucide-react';
import { requireUser } from '@/lib/auth/current-user';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ExpandableStats } from '@/components/ui/expandable-stats';
import { EmptyState } from '@/components/ui/states';
import { Badge, Money, PageHeader, Progress } from '@/components/ui/money';
import { formatMoney, isCurrency, ratioToPercent, type Currency } from '@nestedflow/domain/money';
import * as repo from '@/modules/finance/repository';
import * as finance from '@/modules/finance/service';
import {
  AddAccountForm,
  AddBudgetForm,
  AddRecurringForm,
  AddTransactionForm,
  AddTransferForm,
  DeleteBudgetButton,
  DeleteTransactionButton,
  RecurringActions,
} from './forms';
import {
  CADENCE_LABEL,
  daysUntil,
  dueLabel,
  monthlyEquivalent,
  SUGGESTED_CATEGORIES,
  type Cadence,
} from '@/modules/finance/recurring';
import { Sheet } from '@/components/ui/sheet';
import { shortDay } from '@/lib/dates';
import { todayFor } from '@/modules/dashboard/service';

export const metadata: Metadata = { title: 'Finance' };

function monthBounds(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
  return { start, end };
}

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const user = await requireUser();
  const { new: opening } = await searchParams;
  const today = todayFor(user.timezone);
  const currency = user.baseCurrency as Currency;
  const { start, end } = monthBounds();

  const [accounts, categories, balances, totals, transactions, budgets, monthTx, byCategory] =
    await Promise.all([
      repo.listAccounts(user.id),
      repo.listCategories(user.id),
      repo.accountBalances(user.id),
      repo.periodTotals(user.id, start, end),
      repo.listTransactions(user.id, { limit: 25 }),
      finance.budgetProgress(user.id, start, end),
      repo.listTransactions(user.id, { from: start, to: end, limit: 500 }),
      repo.spendByCategory(user.id, start, end),
    ]);
  const recurring = (await repo.listSubscriptions(user.id)).filter((b) => b.status === 'active');

  const billFor = await repo.billIdsForTransactions(
    user.id,
    monthTx.map((tx) => tx.id),
  );
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const totalBalance = [...balances.values()].reduce((a, b) => a + b, 0n);

  const expenseCategories = categories.filter((c) => c.kind === 'expense');
  const budgetSuggestions = [
    ...new Set([...expenseCategories.map((c) => c.name), ...SUGGESTED_CATEGORIES]),
  ];
  // What recurring bills cost a month, per currency (usually just one).
  const perMonth = new Map<string, bigint>();
  for (const bill of recurring) {
    perMonth.set(
      bill.currency,
      (perMonth.get(bill.currency) ?? 0n) +
        monthlyEquivalent(bill.amountMinor, bill.cadence as Cadence),
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Money"
        accent="finance"
        icon={<Wallet />}
        title="Finance"
        description="Accounts, spending and bills. Entered by you, never linked to a bank."
        action={
          <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center">
            {accounts.length > 0 && (
              <Sheet
                label="Add transaction"
                description="Money in or out of one of your accounts."
                defaultOpen={opening === 'transaction'}
                className="col-span-3 h-12 text-base sm:order-last sm:h-10 sm:text-sm"
              >
                <AddTransactionForm accounts={accounts} categories={categories} />
              </Sheet>
            )}
            <Link
              href="/finance/scan"
              className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-border-subtle bg-surface-overlay py-3 text-xs font-medium text-text-primary shadow-(--shadow-edge) hover:border-border-strong sm:h-10 sm:flex-row sm:gap-2 sm:rounded-full sm:px-4 sm:py-0 sm:text-sm"
            >
              <ScanLine aria-hidden className="size-4" />
              Scan a bill
            </Link>
            <Link
              href="/finance/import"
              className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-border-subtle bg-surface-overlay py-3 text-xs font-medium text-text-primary shadow-(--shadow-edge) hover:border-border-strong sm:h-10 sm:flex-row sm:gap-2 sm:rounded-full sm:px-4 sm:py-0 sm:text-sm"
            >
              <FileUp aria-hidden className="size-4" />
              <span className="sm:hidden">Import</span>
              <span className="hidden sm:inline">Import statement</span>
            </Link>
            <Link
              href="/finance/bills"
              className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-border-subtle bg-surface-overlay py-3 text-xs font-medium text-text-primary shadow-(--shadow-edge) hover:border-border-strong sm:h-10 sm:flex-row sm:gap-2 sm:rounded-full sm:px-4 sm:py-0 sm:text-sm"
            >
              <Receipt aria-hidden className="size-4" />
              Bills
            </Link>
          </div>
        }
      />

      <Card accent="finance">
        <CardBody>
          <ExpandableStats
            stats={[
              {
                key: 'balance',
                label: 'Total balance',
                action: 'Show the accounts behind your balance',
                value: <Money minor={totalBalance} currency={currency} />,
                detail: (
                  <BalanceDetail
                    rows={accounts.map((a) => ({
                      id: a.id,
                      name: a.name,
                      kind: a.kind,
                      minor: balances.get(a.id) ?? 0n,
                      currency: a.currency as Currency,
                    }))}
                    total={totalBalance}
                  />
                ),
              },
              {
                key: 'income',
                label: 'Income this month',
                tone: 'positive',
                action: 'Show your income this month',
                value: <Money minor={totals.incomeMinor} currency={currency} />,
                detail: (
                  <TransactionHistory
                    rows={monthTx.filter((tx) => tx.kind === 'income')}
                    accountName={accountName}
                    categoryName={categoryName}
                    billFor={billFor}
                    today={today}
                    empty="No income recorded this month yet."
                  />
                ),
              },
              {
                key: 'spent',
                label: 'Spent this month',
                tone: 'negative',
                action: 'Show what you spent this month',
                value: <Money minor={totals.expenseMinor} currency={currency} />,
                detail: (
                  <SpendDetail
                    byCategory={byCategory.map((row) => ({
                      name: row.categoryId
                        ? (categoryName.get(row.categoryId) ?? 'Category')
                        : 'Uncategorised',
                      minor: row.spentMinor,
                    }))}
                    total={totals.expenseMinor}
                    currency={currency}
                    history={
                      <TransactionHistory
                        rows={monthTx.filter((tx) => tx.kind === 'expense')}
                        accountName={accountName}
                        categoryName={categoryName}
                        billFor={billFor}
                        today={today}
                        empty="Nothing spent this month yet."
                      />
                    }
                  />
                ),
              },
            ]}
          />
        </CardBody>
      </Card>

      <Card accent="finance">
        <CardHeader
          title="Accounts"
          description={accounts.length === 0 ? 'Where your money lives' : undefined}
          action={
            // One stable spot for "New account", empty or not: the sheet has
            // to survive the first account appearing, or its confirmation
            // would vanish with the empty state.
            <div className="flex gap-1">
              {accounts.length >= 2 && (
                <Sheet
                  label="Move money"
                  variant="ghost"
                  icon={<ArrowLeftRight />}
                  description="Between your own accounts. Not counted as income or spending."
                  className="h-8 px-3 text-xs"
                >
                  <AddTransferForm accounts={accounts} />
                </Sheet>
              )}
              <Sheet
                label="New account"
                variant={accounts.length === 0 ? 'primary' : 'secondary'}
                description="Cash, a bank account or a card."
                defaultOpen={opening === 'account'}
                className="h-8 px-3 text-xs"
              >
                <AddAccountForm defaultCurrency={currency} />
              </Sheet>
            </div>
          }
        />
        <CardBody className="p-0">
          {accounts.length === 0 ? (
            <EmptyState
              icon={<Wallet aria-hidden className="size-5" />}
              title="No accounts yet"
              description="Tap New account to add your bank account, cash or a card. Then record what you spend."
            />
          ) : (
            <ul className="divide-y divide-border-subtle">
              {accounts.map((account) => (
                <li key={account.id} className="flex items-center justify-between gap-4 px-5 py-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-text-primary">{account.name}</span>
                    <span className="text-xs text-text-muted capitalize">{account.kind}</span>
                  </span>
                  <Money
                    minor={balances.get(account.id) ?? 0n}
                    currency={account.currency as Currency}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* --------------------------------------------------------- budgets */}
      <Card accent="finance" labelledBy="finance-budgets">
        <CardHeader
          id="finance-budgets"
          title="Budgets"
          icon={<PieChart className="size-4" />}
          accent="finance"
          description={
            budgets.length === 0
              ? 'A monthly limit per category'
              : `This month · ${budgets.filter((b) => b.overBudget).length} over`
          }
          action={
            <Sheet
              label="New budget"
              variant={budgets.length === 0 ? 'primary' : 'secondary'}
              description="A limit for one category, every month."
              className="h-8 px-3 text-xs"
            >
              <AddBudgetForm suggestions={budgetSuggestions} currency={currency} />
            </Sheet>
          }
        />
        <CardBody className={budgets.length === 0 ? 'p-0' : 'flex flex-col gap-5'}>
          {budgets.length === 0 ? (
            <EmptyState
              icon={<PieChart aria-hidden className="size-5" />}
              title="No budgets yet"
              description="Set a monthly limit for food, fuel or shopping and watch how close you are. You hear about it before you go over."
            />
          ) : (
            budgets.map((budget) => {
              const name = categoryName.get(budget.categoryId) ?? 'Category';
              const pct = ratioToPercent(budget.spentMinor, budget.limitMinor);
              const tone = budget.overBudget ? 'negative' : pct >= 80 ? 'warning' : 'positive';
              return (
                <div key={budget.budgetId} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-medium text-text-primary">
                        {name}
                        {budget.overBudget ? (
                          <Badge tone="negative">Over</Badge>
                        ) : pct >= 80 ? (
                          <Badge tone="warning">{pct}% used</Badge>
                        ) : null}
                      </p>
                      <p className="numeric text-xs text-text-muted">
                        <Money minor={budget.spentMinor} currency={currency} /> of{' '}
                        <Money minor={budget.limitMinor} currency={currency} />
                        {' · '}
                        {budget.overBudget ? (
                          <span className="text-negative">
                            <Money minor={-budget.remainingMinor} currency={currency} /> over
                          </span>
                        ) : (
                          <>
                            <Money minor={budget.remainingMinor} currency={currency} /> left
                          </>
                        )}
                      </p>
                    </div>
                    <DeleteBudgetButton id={budget.budgetId} name={name} />
                  </div>
                  <Progress value={pct} label={`${name} budget used`} tone={tone} />
                </div>
              );
            })
          )}
        </CardBody>
      </Card>

      {/* ------------------------------------------------- recurring bills */}
      <Card accent="finance" labelledBy="finance-recurring">
        <CardHeader
          id="finance-recurring"
          title="Recurring bills"
          icon={<CalendarClock className="size-4" />}
          accent="finance"
          description={
            recurring.length === 0
              ? 'Subscriptions, rent, EMIs'
              : [...perMonth]
                  .map(([cur, minor]) => `About ${formatMinor(minor, cur)} a month`)
                  .join(' · ')
          }
          action={
            <Sheet
              label="New bill"
              variant={recurring.length === 0 ? 'primary' : 'secondary'}
              description="Anything that repeats: Netflix, rent, EMI, phone, gym."
              className="h-8 px-3 text-xs"
            >
              <AddRecurringForm
                accounts={accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
                categories={categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind }))}
                today={today}
              />
            </Sheet>
          }
        />
        <CardBody className="p-0">
          {recurring.length === 0 ? (
            <EmptyState
              icon={<CalendarClock aria-hidden className="size-5" />}
              title="Nothing recurring yet"
              description="Add the bills that repeat. You get a reminder three days before each, and Paid records it in one tap."
            />
          ) : (
            <ul className="divide-y divide-border-subtle">
              {recurring.map((bill) => {
                const days = daysUntil(bill.nextDueOn, today);
                return (
                  <li
                    key={bill.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-text-primary">{bill.name}</p>
                      <p className="text-xs text-text-muted">
                        <span
                          className={
                            days < 0
                              ? 'font-medium text-negative'
                              : days <= 3
                                ? 'font-medium text-warning'
                                : undefined
                          }
                        >
                          {dueLabel(bill.nextDueOn, today)}
                        </span>
                        {' · '}
                        {CADENCE_LABEL[bill.cadence as Cadence]}
                        {bill.accountId ? ` · ${accountName.get(bill.accountId) ?? 'Account'}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <Money minor={bill.amountMinor} currency={bill.currency as Currency} />
                      <RecurringActions id={bill.id} name={bill.name} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card accent="finance" labelledBy="finance-recent">
        <CardHeader id="finance-recent" title="Recent transactions" />
        <CardBody className="p-0">
          {transactions.length === 0 ? (
            <EmptyState
              title="Nothing recorded yet"
              description={
                accounts.length === 0
                  ? 'Add an account first, then your spending shows up here.'
                  : 'Tap Add transaction, or scan a bill.'
              }
            />
          ) : (
            <ul className="divide-y divide-border-subtle">
              {transactions.map((tx) => (
                <li key={tx.id} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-text-primary">{tx.description}</p>
                    <p className="numeric mt-0.5 text-xs text-text-muted">
                      {shortDay(tx.occurredOn, today)} ·{' '}
                      {accountName.get(tx.accountId) ?? 'Account'}
                      {tx.categoryId ? ` · ${categoryName.get(tx.categoryId) ?? ''}` : ''}
                      {tx.kind === 'transfer' ? ' · Transfer' : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Money minor={tx.amountMinor} currency={tx.currency as Currency} signed />
                    <DeleteTransactionButton id={tx.id} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

/* ------------------------------------------------ histories under the totals */

type Tx = Awaited<ReturnType<typeof repo.listTransactions>>[number];

function BalanceDetail({
  rows,
  total,
}: {
  rows: { id: string; name: string; kind: string; minor: bigint; currency: Currency }[];
  total: bigint;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-text-muted">No accounts yet.</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-text-primary">
              {row.name}
              <span className="ml-2 text-xs text-text-muted capitalize">{row.kind}</span>
            </span>
            <Money minor={row.minor} currency={row.currency} />
          </div>
          <Progress
            value={total > 0n && row.minor > 0n ? ratioToPercent(row.minor, total) : 0}
            label={`${row.name} share of your total balance`}
            tone="positive"
          />
        </li>
      ))}
    </ul>
  );
}

function SpendDetail({
  byCategory,
  total,
  currency,
  history,
}: {
  byCategory: { name: string; minor: bigint }[];
  total: bigint;
  currency: Currency;
  history: React.ReactNode;
}) {
  const sorted = [...byCategory].sort((a, b) =>
    b.minor > a.minor ? 1 : b.minor < a.minor ? -1 : 0,
  );
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <p className="mb-3 text-2xs font-medium tracking-wide text-text-muted uppercase">
          Where it went
        </p>
        {sorted.length === 0 ? (
          <p className="text-sm text-text-muted">Nothing spent this month yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {sorted.map((row) => (
              <li key={row.name} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-text-primary">{row.name}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Money minor={row.minor} currency={currency} />
                    <span className="numeric w-10 text-right text-xs text-text-muted">
                      {total > 0n ? `${Math.round(ratioToPercent(row.minor, total))}%` : ''}
                    </span>
                  </span>
                </div>
                <Progress
                  value={total > 0n ? ratioToPercent(row.minor, total) : 0}
                  label={`${row.name} share of this month's spending`}
                  tone="negative"
                />
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="mb-3 text-2xs font-medium tracking-wide text-text-muted uppercase">
          Every purchase
        </p>
        {history}
      </div>
    </div>
  );
}

function TransactionHistory({
  rows,
  accountName,
  categoryName,
  billFor,
  today,
  empty,
}: {
  rows: Tx[];
  accountName: Map<string, string>;
  categoryName: Map<string, string>;
  /** Transaction id → its kept bill photo. */
  billFor: Map<string, string>;
  today: string;
  empty: string;
}) {
  if (rows.length === 0) return <p className="text-sm text-text-muted">{empty}</p>;
  return (
    <ul className="-my-2 max-h-80 divide-y divide-border-subtle overflow-y-auto">
      {rows.map((tx) => (
        <li key={tx.id} className="flex items-center justify-between gap-4 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm text-text-primary">{tx.description}</p>
            <p className="numeric mt-0.5 text-xs text-text-muted">
              {shortDay(tx.occurredOn, today)} · {accountName.get(tx.accountId) ?? 'Account'}
              {tx.categoryId ? ` · ${categoryName.get(tx.categoryId) ?? ''}` : ''}
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-2">
            {billFor.has(tx.id) && (
              <Link
                href={`/finance/bills/${billFor.get(tx.id)}`}
                aria-label={`Bill photo for ${tx.description}`}
                title="Bill photo"
                className="inline-flex size-7 items-center justify-center rounded-full text-text-muted hover:bg-surface-raised hover:text-text-primary"
              >
                <Receipt aria-hidden className="size-3.5" />
              </Link>
            )}
            <Money minor={tx.amountMinor} currency={tx.currency as Currency} signed />
          </span>
        </li>
      ))}
    </ul>
  );
}

function formatMinor(minor: bigint, currency: string): string {
  return isCurrency(currency) ? formatMoney(minor, currency) : `${minor} ${currency}`;
}
