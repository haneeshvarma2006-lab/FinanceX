import type { Metadata } from 'next';
import { Wallet } from 'lucide-react';
import { requireUser } from '@/lib/auth/current-user';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ExpandableStats } from '@/components/ui/expandable-stats';
import { EmptyState } from '@/components/ui/states';
import { Badge, Money, PageHeader, Progress } from '@/components/ui/money';
import { ratioToPercent, type Currency } from '@nestedflow/domain/money';
import * as repo from '@/modules/finance/repository';
import * as finance from '@/modules/finance/service';
import { AddAccountForm, AddTransactionForm, AddTransferForm } from './forms';
import { DeleteTransactionButton } from './forms';
import { brand } from '@/lib/brand';

export const metadata: Metadata = { title: 'Finance' };

function monthBounds(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
  return { start, end };
}

export default async function FinancePage() {
  const user = await requireUser();
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

  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const totalBalance = [...balances.values()].reduce((a, b) => a + b, 0n);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Money"
        accent="finance"
        title="Finance"
        description={`Everything here is entered by you. ${brand.name} connects to no bank.`}
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
          description="Balances are derived from your ledger, never stored separately."
        />
        <CardBody className="p-0">
          {accounts.length === 0 ? (
            <EmptyState
              icon={<Wallet aria-hidden className="size-5" />}
              title="No accounts yet"
              description="Add a cash, bank or card account to start recording transactions against it."
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

      {budgets.length > 0 && (
        <Card accent="finance">
          <CardHeader title="Budgets this month" />
          <CardBody className="flex flex-col gap-4">
            {budgets.map((budget) => (
              <div key={budget.budgetId} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-text-primary">
                    {categoryName.get(budget.categoryId) ?? 'Uncategorised'}
                  </span>
                  <span className="flex items-center gap-2">
                    <Money minor={budget.spentMinor} currency={currency} />
                    <span className="text-text-muted">
                      / <Money minor={budget.limitMinor} currency={currency} />
                    </span>
                    {budget.overBudget && <Badge tone="negative">Over</Badge>}
                  </span>
                </div>
                <Progress
                  value={ratioToPercent(budget.spentMinor, budget.limitMinor)}
                  label={`${categoryName.get(budget.categoryId) ?? 'Category'} budget used`}
                  tone={budget.overBudget ? 'negative' : 'accent'}
                />
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card accent="finance">
          <CardHeader title="Add an account" />
          <CardBody>
            <AddAccountForm defaultCurrency={currency} />
          </CardBody>
        </Card>

        <Card accent="finance">
          <CardHeader title="Record a transaction" />
          <CardBody>
            {accounts.length === 0 ? (
              <p className="text-sm text-text-muted">Add an account first.</p>
            ) : (
              <AddTransactionForm accounts={accounts} categories={categories} />
            )}
          </CardBody>
        </Card>
      </div>

      {accounts.length >= 2 && (
        <Card accent="finance">
          <CardHeader
            title="Move money between your accounts"
            description="Recorded as two balanced entries, and excluded from income and spending totals."
          />
          <CardBody>
            <AddTransferForm accounts={accounts} />
          </CardBody>
        </Card>
      )}

      <Card accent="finance">
        <CardHeader title="Recent transactions" />
        <CardBody className="p-0">
          {transactions.length === 0 ? (
            <EmptyState
              title="Nothing recorded yet"
              description="Transactions you add will appear here, newest first."
            />
          ) : (
            <ul className="divide-y divide-border-subtle">
              {transactions.map((tx) => (
                <li key={tx.id} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-text-primary">{tx.description}</p>
                    <p className="numeric mt-0.5 text-xs text-text-muted">
                      {tx.occurredOn} · {accountName.get(tx.accountId) ?? 'Account'}
                      {tx.categoryId ? ` · ${categoryName.get(tx.categoryId) ?? ''}` : ''}
                      {tx.kind === 'transfer' ? ' · transfer' : ''}
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
    return <p className="text-sm text-text-muted">No accounts yet — add one below.</p>;
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
  empty,
}: {
  rows: Tx[];
  accountName: Map<string, string>;
  categoryName: Map<string, string>;
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
              {tx.occurredOn} · {accountName.get(tx.accountId) ?? 'Account'}
              {tx.categoryId ? ` · ${categoryName.get(tx.categoryId) ?? ''}` : ''}
            </p>
          </div>
          <Money minor={tx.amountMinor} currency={tx.currency as Currency} signed />
        </li>
      ))}
    </ul>
  );
}
