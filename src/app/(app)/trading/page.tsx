import type { Metadata } from 'next';
import { AlertTriangle, ExternalLink, LineChart } from 'lucide-react';
import { requireUser } from '@/lib/auth/current-user';
import { Card, CardBody, CardHeader, Stat, StatGrid } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import { Badge, Money, PageHeader } from '@/components/ui/money';
import type { Currency } from '@nestedflow/domain/money';
import { formatDecimal, parseDecimal, plannedRewardRisk } from '@nestedflow/domain/trading';
import { COSTLY_EMOTIONS, EMOTION_LABELS } from '@/modules/trading/validators';
import * as repo from '@/modules/trading/repository';
import * as trading from '@/modules/trading/service';
import {
  AddExecutionForm,
  AddNoteForm,
  AddSetupForm,
  AddTradeForm,
  AddTradingAccountForm,
} from './forms';
import { brand } from '@/lib/brand';

export const metadata: Metadata = { title: 'Trading journal' };

export default async function TradingPage() {
  const user = await requireUser();

  const [accounts, strategies] = await Promise.all([
    repo.listTradingAccounts(user.id),
    repo.listStrategies(user.id),
  ]);

  const primary = accounts[0];
  const journalCurrency = primary?.currency ?? user.baseCurrency;
  const [trades, performance, journal] = await Promise.all([
    repo.listTrades(user.id, { limit: 25 }),
    primary ? trading.accountPerformance(user.id, primary.id) : Promise.resolve(undefined),
    trading.journalInsights(user.id, journalCurrency),
  ]);

  const accountName = new Map(accounts.map((a) => [a.id, a]));
  const setupName = new Map(strategies.map((s) => [s.id, s.name]));
  const notesFor = (tradeId: string) => journal.notes.filter((n) => n.tradeId === tradeId);
  const rewardRisk = (trade: (typeof trades)[number]) => {
    try {
      const rr = plannedRewardRisk(
        trade.averageEntryPrice ? parseDecimal(trade.averageEntryPrice) : null,
        trade.stopPrice ? parseDecimal(trade.stopPrice) : null,
        trade.targetPrice ? parseDecimal(trade.targetPrice) : null,
      );
      return rr === null ? null : formatDecimal(rr, 2);
    } catch {
      return null;
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Markets"
        accent="trading"
        title="Trading journal"
        description={`A record of trades you placed elsewhere. ${brand.name} cannot place orders.`}
      />

      {/* Required disclosure, not a footnote. */}
      <Card tone="warning">
        <CardBody>
          <p className="text-sm text-pretty text-text-secondary">
            <strong className="text-text-primary">Every figure here is yours.</strong> All prices
            and quantities were entered by you; {brand.name} fetches no market data and connects to
            no broker. Statistics describe trades you have already recorded and say nothing about
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

          <Card accent="trading">
            <CardBody>
              <StatGrid columns={4}>
                <Stat label="Closed trades" value={performance.stats.trades} />
                <Stat
                  label="Win rate"
                  value={
                    performance.stats.trades === 0 ? '—' : `${performance.stats.winRatePercent}%`
                  }
                  detail={`${performance.stats.wins}W · ${performance.stats.losses}L · ${performance.stats.breakEven}BE`}
                />
                <Stat
                  label="Realised P&L"
                  value={
                    <Money
                      minor={performance.stats.netPnlMinor}
                      currency={primary.currency as Currency}
                      signed
                    />
                  }
                />
                <Stat
                  label="Max drawdown"
                  tone="negative"
                  value={
                    <Money
                      minor={performance.curve.maxDrawdownMinor}
                      currency={primary.currency as Currency}
                    />
                  }
                />
              </StatGrid>
            </CardBody>
          </Card>
        </>
      )}

      {/* ------------------------------------------------ what the journal shows */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card accent="trading">
          <CardHeader
            title="Psychology"
            description="What each feeling you tagged has cost or earned."
          />
          <CardBody className="flex flex-col gap-4">
            {journal.afterLoss.trades > 0 && (
              <p className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning-soft px-3 py-2.5 text-xs text-pretty text-text-primary">
                <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0 text-warning" />
                <span>
                  {journal.afterLoss.trades} trade{journal.afterLoss.trades === 1 ? '' : 's'} opened
                  within an hour of a loss
                  {journal.afterLoss.closed > 0 && (
                    <>
                      {' '}
                      — together{' '}
                      <Money
                        minor={journal.afterLoss.netPnlMinor}
                        currency={journalCurrency as Currency}
                        signed
                      />
                    </>
                  )}
                  . Worth asking whether any were revenge trades.
                </span>
              </p>
            )}
            {journal.emotions.length === 0 ? (
              <p className="text-sm text-pretty text-text-muted">
                Tag how you felt in each trade’s journal — fear, greed, FOMO, revenge, or calm and
                disciplined — and this shows what each one does to your results.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border-subtle">
                {journal.emotions.map((group) => (
                  <li
                    key={group.key}
                    className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <span className="flex items-center gap-2 text-sm">
                      <Badge tone={COSTLY_EMOTIONS.includes(group.key) ? 'negative' : 'positive'}>
                        {EMOTION_LABELS[group.key as keyof typeof EMOTION_LABELS] ?? group.key}
                      </Badge>
                      <span className="numeric text-xs text-text-muted">
                        {group.trades} trade{group.trades === 1 ? '' : 's'}
                        {group.closed > 0
                          ? ` · ${Math.round((group.wins / group.closed) * 100)}% won`
                          : ''}
                      </span>
                    </span>
                    {group.closed > 0 && (
                      <Money
                        minor={group.netPnlMinor}
                        currency={journalCurrency as Currency}
                        signed
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card accent="trading">
          <CardHeader title="Setups" description="Which of your setups actually pay." />
          <CardBody className="flex flex-col gap-5">
            {journal.setups.length > 0 && (
              <ul className="flex flex-col divide-y divide-border-subtle">
                {journal.setups.map((group) => (
                  <li
                    key={group.key}
                    className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-text-primary">
                        {group.label}
                      </span>
                      <span className="numeric text-xs text-text-muted">
                        {group.trades} trade{group.trades === 1 ? '' : 's'}
                        {group.closed > 0
                          ? ` · ${Math.round((group.wins / group.closed) * 100)}% won`
                          : ''}
                      </span>
                    </span>
                    {group.closed > 0 && (
                      <Money
                        minor={group.netPnlMinor}
                        currency={journalCurrency as Currency}
                        signed
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
            <AddSetupForm />
          </CardBody>
        </Card>
      </div>

      <Card accent="trading">
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
                const rr = rewardRisk(trade);
                const emotions = [...(journal.emotionsByTrade.get(trade.id) ?? [])];
                const notes = notesFor(trade.id);
                return (
                  <li key={trade.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-sm text-text-primary">
                          <span className="font-semibold">{trade.symbol}</span>
                          <Badge tone={trade.direction === 'long' ? 'positive' : 'negative'}>
                            {trade.direction}
                          </Badge>
                          <Badge>{trade.status}</Badge>
                          {trade.strategyId && setupName.get(trade.strategyId) && (
                            <Badge tone="accent">{setupName.get(trade.strategyId)}</Badge>
                          )}
                          {account && account.environment !== 'live' && (
                            <Badge tone="warning">{account.environment}</Badge>
                          )}
                          {journal.soonAfterLoss.has(trade.id) && (
                            <Badge tone="warning">Within an hour of a loss</Badge>
                          )}
                        </p>
                        <p className="numeric mt-1.5 text-xs text-text-muted">
                          {trade.averageEntryPrice
                            ? `Entry ${formatDecimal(parseDecimal(trade.averageEntryPrice), 4)}`
                            : 'No fills yet'}
                          {trade.averageExitPrice
                            ? ` → Exit ${formatDecimal(parseDecimal(trade.averageExitPrice), 4)}`
                            : ''}
                          {trade.stopPrice
                            ? ` · Stop ${formatDecimal(parseDecimal(trade.stopPrice), 4)}`
                            : ''}
                          {rr ? ` · RR 1:${rr}` : ''}
                          {trade.rMultiple
                            ? ` · ${formatDecimal(parseDecimal(trade.rMultiple), 2)}R`
                            : ''}
                        </p>
                        {emotions.length > 0 && (
                          <p className="mt-2 flex flex-wrap gap-1.5">
                            {emotions.map((e) => (
                              <Badge
                                key={e}
                                tone={COSTLY_EMOTIONS.includes(e) ? 'negative' : 'positive'}
                              >
                                {EMOTION_LABELS[e as keyof typeof EMOTION_LABELS] ?? e}
                              </Badge>
                            ))}
                          </p>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-3">
                        {trade.chartUrl && (
                          <a
                            href={trade.chartUrl}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary"
                          >
                            Chart <ExternalLink aria-hidden className="size-3" />
                          </a>
                        )}
                        {trade.status === 'closed' && (
                          <Money
                            minor={trade.realizedPnlMinor}
                            currency={trade.currency as Currency}
                            signed
                            className="text-base font-semibold"
                          />
                        )}
                      </div>
                    </div>

                    <details className="group/journal mt-3">
                      <summary className="cursor-pointer text-xs text-text-secondary hover:text-text-primary">
                        Journal
                        {notes.length > 0
                          ? ` · ${notes.length} ${notes.length === 1 ? 'entry' : 'entries'}`
                          : ''}{' '}
                        and fills
                      </summary>
                      <div className="mt-4 grid gap-6 lg:grid-cols-2">
                        <div className="flex flex-col gap-4">
                          {notes.length > 0 && (
                            <ol className="flex flex-col gap-3">
                              {notes.map((note) => (
                                <li
                                  key={note.id}
                                  className="rounded-xl border border-border-subtle bg-surface-inset/40 p-3"
                                >
                                  <p className="flex flex-wrap items-center gap-2 text-2xs text-text-muted">
                                    <span className="font-medium tracking-wide uppercase">
                                      {note.kind}
                                    </span>
                                    {note.emotionTag && (
                                      <Badge
                                        tone={
                                          COSTLY_EMOTIONS.includes(note.emotionTag)
                                            ? 'negative'
                                            : 'positive'
                                        }
                                      >
                                        {EMOTION_LABELS[
                                          note.emotionTag as keyof typeof EMOTION_LABELS
                                        ] ?? note.emotionTag}
                                      </Badge>
                                    )}
                                    {note.confidence && <span>conviction {note.confidence}/5</span>}
                                    <span className="numeric">
                                      {note.createdAt.toISOString().slice(0, 10)}
                                    </span>
                                  </p>
                                  <p className="mt-1.5 text-sm text-pretty whitespace-pre-line text-text-primary">
                                    {note.body}
                                  </p>
                                </li>
                              ))}
                            </ol>
                          )}
                          <AddNoteForm tradeId={trade.id} />
                        </div>
                        {trade.status !== 'cancelled' && (
                          <div>
                            <p className="mb-3 text-xs font-medium text-text-secondary">
                              Add a fill
                            </p>
                            <AddExecutionForm tradeId={trade.id} />
                          </div>
                        )}
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card accent="trading">
          <CardHeader title="Add a trading account" />
          <CardBody>
            <AddTradingAccountForm defaultCurrency={user.baseCurrency} />
          </CardBody>
        </Card>

        <Card accent="trading">
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
