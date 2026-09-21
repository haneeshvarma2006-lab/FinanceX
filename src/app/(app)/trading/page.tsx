import type { Metadata } from 'next';
import { LineChart } from 'lucide-react';
import { requireUser } from '@/lib/auth/current-user';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import { Badge, Money, PageHeader } from '@/components/ui/money';
import type { Currency } from '@kylix/domain/money';
import * as repo from '@/modules/trading/repository';
import * as trading from '@/modules/trading/service';
import { AddExecutionForm, AddTradeForm, AddTradingAccountForm } from './forms';

export const metadata: Metadata = { title: 'Trading journal' };

export default async function TradingPage() {
  const user = await requireUser();

  const [accounts, strategies] = await Promise.all([
    repo.listTradingAccounts(user.id),
    repo.listStrategies(user.id),
  ]);

  const primary = accounts[0];
  const [trades, performance] = await Promise.all([
    repo.listTrades(user.id, { limit: 25 }),
    primary ? trading.accountPerformance(user.id, primary.id) : Promise.resolve(undefined),
  ]);

  const accountName = new Map(accounts.map((a) => [a.id, a]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Trading journal"
        description="A record of trades you placed elsewhere. KyliX cannot place orders."
      />

      {/* Required disclosure, not a footnote. */}
      <Card className="border-warning/30">
        <CardBody>
          <p className="text-sm text-pretty text-text-secondary">
            <strong className="text-text-primary">Every figure here is yours.</strong> All prices
            and quantities were entered by you; KyliX fetches no market data and connects to no
            broker. Statistics describe trades you have already recorded and say nothing about
            future results — past performance does not indicate future performance. Nothing here is
            financial advice.
          </p>
        </CardBody>
      </Card>

      {performance && primary && (
        <>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium text-text-primary">{primary.name}</h2>
            <Badge tone={primary.environment === 'live' ? 'accent' : 'warning'}>
              {primary.environment}
            </Badge>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardBody>
                <p className="text-xs tracking-wide text-text-muted uppercase">Closed trades</p>
                <p className="numeric mt-2 text-2xl">{performance.stats.trades}</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="text-xs tracking-wide text-text-muted uppercase">Win rate</p>
                <p className="numeric mt-2 text-2xl">
                  {performance.stats.trades === 0 ? '—' : `${performance.stats.winRatePercent}%`}
                </p>
                <p className="numeric mt-1 text-xs text-text-muted">
                  {performance.stats.wins}W · {performance.stats.losses}L ·{' '}
                  {performance.stats.breakEven}BE
                </p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="text-xs tracking-wide text-text-muted uppercase">Realised P&amp;L</p>
                <p className="mt-2 text-2xl">
                  <Money
                    minor={performance.stats.netPnlMinor}
                    currency={primary.currency as Currency}
                    signed
                  />
                </p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="text-xs tracking-wide text-text-muted uppercase">Max drawdown</p>
                <p className="mt-2 text-2xl text-negative">
                  <Money
                    minor={performance.curve.maxDrawdownMinor}
                    currency={primary.currency as Currency}
                  />
                </p>
              </CardBody>
            </Card>
          </div>
        </>
      )}

      <Card>
        <CardHeader
          title="Trades"
          description="Entry and exit prices are calculated from your executions, not typed in."
        />
        <CardBody className="p-0">
          {trades.length === 0 ? (
            <EmptyState
              icon={<LineChart aria-hidden className="size-5" />}
              title="No trades recorded"
              description="Create a trade, then add the fills that opened and closed it."
            />
          ) : (
            <ul className="divide-y divide-border-subtle">
              {trades.map((trade) => {
                const account = accountName.get(trade.tradingAccountId);
                return (
                  <li key={trade.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm text-text-primary">
                          <span className="font-medium">{trade.symbol}</span>
                          <Badge tone={trade.direction === 'long' ? 'positive' : 'negative'}>
                            {trade.direction}
                          </Badge>
                          <Badge>{trade.status}</Badge>
                          {account && account.environment !== 'live' && (
                            <Badge tone="warning">{account.environment}</Badge>
                          )}
                        </p>
                        <p className="numeric mt-1 text-xs text-text-muted">
                          {trade.averageEntryPrice
                            ? `in ${Number(trade.averageEntryPrice)}`
                            : 'no fills yet'}
                          {trade.averageExitPrice ? ` · out ${Number(trade.averageExitPrice)}` : ''}
                          {trade.rMultiple ? ` · ${Number(trade.rMultiple)}R` : ''}
                        </p>
                      </div>

                      {trade.status === 'closed' && (
                        <Money
                          minor={trade.realizedPnlMinor}
                          currency={trade.currency as Currency}
                          signed
                        />
                      )}
                    </div>

                    {trade.status !== 'cancelled' && (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-xs text-accent">
                          Add an execution
                        </summary>
                        <div className="mt-3">
                          <AddExecutionForm tradeId={trade.id} />
                        </div>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Add a trading account" />
          <CardBody>
            <AddTradingAccountForm defaultCurrency={user.baseCurrency} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Log a trade" />
          <CardBody>
            {accounts.length === 0 ? (
              <p className="text-sm text-text-muted">Add a trading account first.</p>
            ) : (
              <AddTradeForm accounts={accounts} strategies={strategies} />
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
