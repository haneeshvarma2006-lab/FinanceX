import { absDecimal, divDecimal } from './decimal';

/**
 * Journal analytics: things a trader should see about their own behaviour,
 * computed only from what they recorded.
 */

/**
 * Planned reward-to-risk: how far the target sits from entry, measured in
 * units of the distance to the stop. 2.5 means "risking 1 to make 2.5".
 * Scaled decimals in, a scaled decimal out; null when there is no risk to
 * measure against (no stop, or a stop at the entry price).
 */
export function plannedRewardRisk(
  entry: bigint | null,
  stop: bigint | null,
  target: bigint | null,
): bigint | null {
  if (entry === null || stop === null || target === null) return null;
  const risk = absDecimal(entry - stop);
  if (risk === 0n) return null;
  return divDecimal(absDecimal(target - entry), risk);
}

export type JournalTrade = {
  id: string;
  accountId: string;
  openedAt: Date | null;
  closedAt: Date | null;
  realizedPnlMinor: bigint;
  status: string;
};

/**
 * Trades opened soon after a losing trade closed on the same account.
 *
 * The honest, measurable signal behind "revenge trading": it does not claim
 * to read intent, only that a new position followed a loss within the
 * window. Whether it was revenge is for the trader to say in their notes.
 */
export function openedSoonAfterLoss(
  trades: readonly JournalTrade[],
  windowMs: number = 60 * 60 * 1000,
): Set<string> {
  const losses = trades
    .filter((t) => t.status === 'closed' && t.closedAt && t.realizedPnlMinor < 0n)
    .map((t) => ({ accountId: t.accountId, closedAt: t.closedAt!.getTime(), id: t.id }));

  const flagged = new Set<string>();
  for (const trade of trades) {
    if (!trade.openedAt) continue;
    const opened = trade.openedAt.getTime();
    const followsLoss = losses.some(
      (loss) =>
        loss.id !== trade.id &&
        loss.accountId === trade.accountId &&
        opened >= loss.closedAt &&
        opened - loss.closedAt <= windowMs,
    );
    if (followsLoss) flagged.add(trade.id);
  }
  return flagged;
}
