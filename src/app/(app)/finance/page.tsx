import type { Metadata } from 'next';
import { Wallet } from 'lucide-react';
import { requireUser } from '@/lib/auth/current-user';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import { Badge, Money, PageHeader, Progress } from '@/components/ui/money';
import { ratioToPercent, type Currency } from '@/lib/money';
import * as repo from '@/modules/finance/repository';
import * as finance from '@/modules/finance/service';
import { AddAccountForm, AddTransactionForm, AddTransferForm } from './forms';
import { DeleteTransactionButton } from './forms';

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

  const [accounts, categories, balances, totals, transactions, budgets] = await Promise.all([
    repo.listAccounts(user.id),
    repo.listCategories(user.id),
    repo.accountBalances(user.id),
    repo.periodTotals(user.id, start, end),
    repo.listTransactions(user.id, { limit: 25 }),
    finance.budgetProgress(user.id, start, end),
  ]);

  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const totalBalance = [...balances.values()].reduce((a, b) => a + b, 0n);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Finance"
        description="Everything here is entered by you. KyliX connects to no bank."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardBody>
            <p className="text-xs tracking-wide text-text-muted uppercase">Total balance</p>
            <p className="mt-2 text-2xl">
              <Money minor={totalBalance} currency={currency} />
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs tracking-wide text-text-muted uppercase">Income this month</p>
            <p className="mt-2 text-2xl text-positive">
              <Money minor={totals.incomeMinor} currency={currency} />
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs tracking-wide text-text-muted uppercase">Spent this month</p>
            <p className="mt-2 text-2xl text-negative">
              <Money minor={totals.expenseMinor} currency={currency} />
            </p>
          </CardBody>
        </Card>
      </div>

      <Card>
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
        <Card>
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Add an account" />
          <CardBody>
            <AddAccountForm defaultCurrency={currency} />
          </CardBody>
        </Card>

        <Card>
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
        <Card>
          <CardHeader
            title="Move money between your accounts"
            description="Recorded as two balanced entries, and excluded from income and spending totals."
          />
          <CardBody>
            <AddTransferForm accounts={accounts} />
          </CardBody>
        </Card>
      )}

      <Card>
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
