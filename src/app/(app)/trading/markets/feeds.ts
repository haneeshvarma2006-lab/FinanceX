'use client';

import { useEffect, useState } from 'react';
import { parseTickerMessage, streamUrl } from '@/modules/markets/binance';

/**
 * The two live price feeds, shared by Live markets and Portfolio: Binance's
 * public stream for crypto, and this app's keyed-quote cache for the rest.
 */

/* --------------------------------------------------------------- quotes --- */

export type Quote = {
  price: number;
  changePercent: number | null;
  high: number | null;
  low: number | null;
  /** Up or down against the previous update. */
  direction: 'up' | 'down' | 'flat';
  /** Increments on every update, so the flash replays. */
  tick: number;
  history: number[];
  marketOpen?: boolean | null;
  /** When the provider says this price is from (keyed quotes). */
  at?: number;
  /** A keyed price kept from an earlier refresh, and why. */
  stale?: boolean;
  note?: string;
};

type KeyedResult =
  | {
      ok: true;
      price: number;
      changePercent: number | null;
      high: number | null;
      low: number | null;
      marketOpen: boolean | null;
      at: number;
      stale: boolean;
      note?: string;
    }
  | { ok: false; error: string };

const HISTORY = 60;

function nextQuote(prev: Quote | undefined, update: Omit<Quote, 'direction' | 'tick' | 'history'>) {
  const direction: Quote['direction'] =
    !prev || update.price === prev.price ? 'flat' : update.price > prev.price ? 'up' : 'down';
  const history = [...(prev?.history ?? []), update.price].slice(-HISTORY);
  return { ...update, direction, tick: (prev?.tick ?? 0) + 1, history };
}

export type StreamState = 'connecting' | 'live' | 'reconnecting';

/** One combined socket for every crypto symbol, reconnecting with backoff. */
export function useBinance(symbols: string[]) {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [state, setState] = useState<StreamState>('connecting');
  const key = symbols.join(',');

  useEffect(() => {
    if (!key) return;
    const list = key.split(',');
    let socket: WebSocket | null = null;
    let stopped = false;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const open = () => {
      socket = new WebSocket(streamUrl(list));
      socket.onopen = () => {
        attempt = 0;
        setState('live');
      };
      socket.onmessage = (event) => {
        const tick = typeof event.data === 'string' ? parseTickerMessage(event.data) : null;
        if (!tick) return;
        setQuotes((all) => ({
          ...all,
          [tick.symbol]: nextQuote(all[tick.symbol], {
            price: tick.price,
            changePercent: tick.changePercent,
            high: tick.high,
            low: tick.low,
          }),
        }));
      };
      socket.onclose = () => {
        if (stopped) return;
        setState('reconnecting');
        retry = setTimeout(open, Math.min(30_000, 1000 * 2 ** attempt++));
      };
      socket.onerror = () => socket?.close();
    };
    open();

    return () => {
      stopped = true;
      clearTimeout(retry);
      socket?.close();
    };
  }, [key]);

  return { quotes, state };
}

/** Keyed quotes from this app's server, refreshed on the shared interval. */
export function useKeyed(ids: string[], enabled: boolean, intervalSeconds: number) {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const key = ids.join(',');

  useEffect(() => {
    if (!enabled || !key) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = async () => {
      // A hidden tab spends nobody's quota.
      if (document.visibilityState === 'visible') {
        try {
          const response = await fetch(`/api/markets/quotes?ids=${encodeURIComponent(key)}`, {
            cache: 'no-store',
          });
          if (response.ok) {
            const body = (await response.json()) as {
              quotes?: Record<string, KeyedResult>;
            };
            const results = Object.entries(body.quotes ?? {});
            if (!stopped) {
              setQuotes((all) => {
                const next = { ...all };
                for (const [id, q] of results) {
                  if (!q.ok) continue;
                  const prev = all[id];
                  // The same cached price again is not a new tick.
                  next[id] =
                    prev && prev.price === q.price && prev.at === q.at
                      ? { ...prev, stale: q.stale, note: q.note }
                      : nextQuote(prev, q);
                }
                return next;
              });
              setErrors(
                Object.fromEntries(results.flatMap(([id, q]) => (q.ok ? [] : [[id, q.error]]))),
              );
            }
          }
        } catch {
          // Offline for a moment: the last prices stay, marked by their age.
        }
      }
      // Asks this app's cache, not the provider, so it may look more often
      // than prices refresh and still show a new one soon after it lands.
      if (!stopped) timer = setTimeout(load, Math.min(intervalSeconds, 120) * 1000);
    };
    void load();

    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [key, enabled, intervalSeconds]);

  return { quotes, errors };
}
