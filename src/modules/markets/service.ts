import { getEnv, type Env } from '@/lib/env';
import { consume } from '@/lib/security/rate-limit';
import { fetchAlphaVantage } from './alphavantage';
import { MAX_KEYED } from './catalog';
import type { ProviderQuote } from './provider';
import * as repo from './repository';
import type { MarketQuoteRow, StoredQuote } from './schema';
import { fetchTwelveData } from './twelvedata';

/**
 * Keyed market prices: which provider, how often, and how much of its
 * allowance may be spent.
 *
 * Every price is cached in the database and shared, so a refresh is one
 * request for everyone however many people are watching, and a cold server
 * instance does not spend the allowance again. Budgets are counted in the
 * database too, across all instances, and never exceeded: when the
 * allowance is spent, the last real price stays on screen with its time.
 */

export type MarketProvider = {
  name: 'alphavantage' | 'twelvedata';
  label: string;
  key: string;
  refreshSeconds: number;
  perMinute: number;
  /** 0 means no daily cap. */
  perDay: number;
};

export function marketProvider(env: Env = getEnv()): MarketProvider | null {
  if (env.ALPHA_VANTAGE_API_KEY) {
    const perDay = env.ALPHA_VANTAGE_DAILY_LIMIT;
    return {
      name: 'alphavantage',
      label: 'Alpha Vantage',
      key: env.ALPHA_VANTAGE_API_KEY,
      // Spread a capped day evenly over a full watchlist; uncapped, refresh
      // every minute.
      refreshSeconds:
        env.MARKET_POLL_SECONDS ??
        (perDay > 0 ? Math.max(3600, Math.ceil((86_400 * MAX_KEYED) / perDay)) : 60),
      perMinute: env.ALPHA_VANTAGE_PER_MINUTE,
      perDay,
    };
  }
  if (env.TWELVE_DATA_API_KEY) {
    return {
      name: 'twelvedata',
      label: 'Twelve Data',
      key: env.TWELVE_DATA_API_KEY,
      refreshSeconds: env.MARKET_POLL_SECONDS ?? 60,
      perMinute: 8,
      perDay: 800,
    };
  }
  return null;
}

export type ServedQuote =
  ({ ok: true; stale: boolean; note?: string } & StoredQuote) | { ok: false; error: string };

function served(row: MarketQuoteRow | undefined, note?: string): ServedQuote {
  if (row?.quote) {
    const why = note ?? row.error ?? undefined;
    return { ok: true, ...row.quote, stale: Boolean(why), ...(why ? { note: why } : {}) };
  }
  return { ok: false, error: note ?? row?.error ?? 'No price yet' };
}

type Fetcher = typeof fetch;

/** One request in flight per instrument within this instance. */
const inFlight = new Map<string, Promise<ProviderQuote>>();

function ask(provider: MarketProvider, id: string, now: number, fetcher: Fetcher) {
  const existing = inFlight.get(id);
  if (existing) return existing;
  const request = (
    provider.name === 'alphavantage'
      ? fetchAlphaVantage(id, provider.key, now, fetcher)
      : fetchTwelveData(id, provider.key, now, fetcher)
  ).finally(() => inFlight.delete(id));
  inFlight.set(id, request);
  return request;
}

export async function keyedQuotes(
  ids: readonly string[],
  provider: MarketProvider,
  now: Date = new Date(),
  fetcher: Fetcher = fetch,
): Promise<Record<string, ServedQuote>> {
  const rows = await repo.findQuotes(ids);
  const refreshMs = provider.refreshSeconds * 1000;
  const out: Record<string, ServedQuote> = {};

  // In order, so the per-minute allowance goes to the list from the top.
  for (const id of ids) {
    const row = rows.get(id);
    const fresh =
      row?.provider === provider.name && now.getTime() - row.attemptedAt.getTime() < refreshMs;
    if (fresh) {
      out[id] = served(row);
      continue;
    }

    const minute = await consume(
      `market:${provider.name}:minute`,
      { limit: provider.perMinute, windowSeconds: 60 },
      now,
    );
    if (!minute.allowed) {
      out[id] = served(row, 'Updating shortly');
      continue;
    }
    if (provider.perDay > 0) {
      const day = await consume(
        `market:${provider.name}:day`,
        { limit: provider.perDay, windowSeconds: 86_400 },
        now,
      );
      if (!day.allowed) {
        out[id] = served(row, "Today's data limit reached");
        continue;
      }
    }

    const result = await ask(provider, id, now.getTime(), fetcher);
    if (result.ok) {
      const { ok: _ok, ...quote } = result;
      await repo.saveAttempt(id, provider.name, { quote }, now);
      out[id] = { ok: true, ...quote, stale: false };
    } else {
      await repo.saveAttempt(id, provider.name, { error: result.error }, now);
      out[id] = served(row, result.error);
    }
  }
  return out;
}
