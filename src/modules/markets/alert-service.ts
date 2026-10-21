import { notify } from '@/modules/productivity/notifications';
import { crosses, type AlertDirection } from './alerts';
import { formatPrice, isInstrumentId, resolveInstrument } from './catalog';
import * as repo from './repository';
import { keyedQuotes, marketProvider } from './service';

/**
 * Checking a user's price alerts.
 *
 * Crypto prices are read by the user's own browser from Binance's public
 * feed and passed in — the server may be somewhere Binance does not serve,
 * and these are the user's own alerts on public prices, so their browser is
 * a fair witness. Gold, forex and shares come from the shared keyed cache,
 * within the provider's allowance. An alert fires once, atomically, and
 * raises one notification.
 */

export type FiredAlert = { id: string; title: string; body: string };

const MAX_OBSERVED = 24;

/** Untrusted input from the browser → finite positive prices for crypto ids. */
export function cleanObserved(input: unknown): Map<string, number> {
  const out = new Map<string, number>();
  if (typeof input !== 'object' || input === null) return out;
  for (const [id, value] of Object.entries(input as Record<string, unknown>)) {
    if (out.size >= MAX_OBSERVED) break;
    if (!id.startsWith('bn:') || !isInstrumentId(id)) continue;
    const price = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(price) && price > 0 && price < 1e15) out.set(id, price);
  }
  return out;
}

export function alertLabel(instrumentId: string, direction: string, target: string | number) {
  const name = resolveInstrument(instrumentId)?.label ?? instrumentId.slice(3);
  return `${name} ${direction === 'above' ? 'above' : 'below'} ${formatPrice(Number(target))}`;
}

export async function checkAlerts(
  userId: string,
  observed: Map<string, number>,
  now: Date = new Date(),
  fetcher: typeof fetch = fetch,
): Promise<FiredAlert[]> {
  const active = await repo.listActiveAlerts(userId);
  if (active.length === 0) return [];

  const prices = new Map(observed);
  const keyedIds = [
    ...new Set(active.map((a) => a.instrumentId).filter((id) => id.startsWith('td:'))),
  ];
  const provider = marketProvider();
  if (keyedIds.length > 0 && provider) {
    const quotes = await keyedQuotes(keyedIds, provider, now, fetcher);
    for (const [id, q] of Object.entries(quotes)) {
      // An old price is still the last real one, but an alert on it would
      // ring for a market that may have moved: only fresh prices count.
      if (q.ok && !q.stale) prices.set(id, q.price);
    }
  }

  const fired: FiredAlert[] = [];
  for (const alert of active) {
    const price = prices.get(alert.instrumentId);
    if (price === undefined) continue;
    if (!crosses(alert.direction as AlertDirection, Number(alert.target), price)) continue;

    const row = await repo.fireAlert(userId, alert.id, String(price), now);
    if (!row) continue;

    const instrument = resolveInstrument(alert.instrumentId);
    const title = `${instrument?.label ?? alert.instrumentId.slice(3)} is ${
      alert.direction === 'above' ? 'above' : 'below'
    } ${formatPrice(Number(alert.target))}`;
    const body = `Now ${formatPrice(price)}${instrument ? ` (${instrument.ticker})` : ''}.`;
    await notify(userId, {
      kind: 'price_alert',
      title,
      body,
      href: '/trading/markets',
      entityType: 'price_alert',
      entityId: alert.id,
      dedupeKey: `alert:${alert.id}:${now.getTime()}`,
    });
    fired.push({ id: alert.id, title, body });
  }
  return fired;
}
