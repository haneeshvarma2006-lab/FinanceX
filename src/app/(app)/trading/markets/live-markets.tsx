'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowDownRight, ArrowUpRight, Check, Plus } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Sheet } from '@/components/ui/sheet';
import {
  binanceIdFor,
  CATALOG,
  cleanWatchlist,
  DEFAULT_WATCHLIST,
  formatPrice,
  KIND_LABEL,
  MAX_KEYED,
  resolveInstrument,
  type Instrument,
  type MarketKind,
} from '@/modules/markets/catalog';
import { parseTickerMessage, streamUrl } from '@/modules/markets/binance';

/* ------------------------------------------------------------ watchlist --- */

/**
 * The list lives in this browser — a per-device convenience, read through
 * useSyncExternalStore so the server render and the first client render
 * agree, and a blocked or private-mode storage simply means the defaults.
 */
const STORAGE_KEY = 'nf.markets.watchlist.v1';
const CHANGED = 'nf-watchlist-changed';

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener('storage', onChange);
  };
}

function useWatchlist(): [string[], (next: string[]) => void] {
  const raw = useSyncExternalStore(subscribe, readStored, () => null);
  const list = useMemo(() => {
    if (raw === null) return [...DEFAULT_WATCHLIST];
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? cleanWatchlist(parsed) : [...DEFAULT_WATCHLIST];
    } catch {
      return [...DEFAULT_WATCHLIST];
    }
  }, [raw]);

  const save = (next: string[]) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanWatchlist(next)));
    } catch {
      // Storage refused: the change lasts until the page is left.
    }
    window.dispatchEvent(new Event(CHANGED));
  };
  return [list, save];
}

/* --------------------------------------------------------------- quotes --- */

type Quote = {
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

type StreamState = 'connecting' | 'live' | 'reconnecting';

/** One combined socket for every crypto symbol, reconnecting with backoff. */
function useBinance(symbols: string[]) {
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
function useKeyed(ids: string[], enabled: boolean, intervalSeconds: number) {
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

/* ---------------------------------------------------------------- screen --- */

function every(seconds: number): string {
  if (seconds < 120) return `${seconds}s`;
  if (seconds < 7200) return `${Math.round(seconds / 60)} min`;
  return `${Math.round(seconds / 3600)} h`;
}

export function LiveMarkets({
  provider,
  intervalSeconds,
  locale,
}: {
  /** The keyed provider's name, or null when none is configured. */
  provider: string | null;
  intervalSeconds: number;
  locale: string;
}) {
  const keyedEnabled = provider !== null;
  const [watchlist, setWatchlist] = useWatchlist();
  const instruments = watchlist.map(resolveInstrument).filter((i): i is Instrument => !!i);
  const crypto = instruments.filter((i) => i.feed === 'binance');
  const keyed = instruments.filter((i) => i.feed === 'keyed');

  const binance = useBinance(crypto.map((i) => i.id.slice(3)));
  const others = useKeyed(
    keyed.map((i) => i.id),
    keyedEnabled,
    intervalSeconds,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StreamBadge state={crypto.length ? binance.state : null} />
        <Sheet
          label="Add markets"
          variant="secondary"
          description={
            keyedEnabled
              ? `Tap to add or remove. Crypto updates live; the rest every ${every(intervalSeconds)}.`
              : 'Tap to add or remove. Crypto updates live.'
          }
          icon={<Plus />}
        >
          <Picker watchlist={watchlist} onChange={setWatchlist} />
        </Sheet>
      </div>

      {crypto.length > 0 && (
        <section aria-labelledby="markets-crypto" className="flex flex-col gap-3">
          <h2 id="markets-crypto" className="text-sm font-semibold text-text-primary">
            Crypto <span className="font-normal text-text-muted">· live from Binance</span>
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {crypto.map((i) => (
              <Tile
                key={i.id}
                instrument={i}
                quote={binance.quotes[i.id.slice(3)]}
                status={binance.state === 'live' ? 'live' : 'waiting'}
                locale={locale}
              />
            ))}
          </ul>
        </section>
      )}

      {keyed.length > 0 && (
        <section aria-labelledby="markets-keyed" className="flex flex-col gap-3">
          <h2 id="markets-keyed" className="text-sm font-semibold text-text-primary">
            Gold, forex &amp; stocks{' '}
            <span className="font-normal text-text-muted">
              {keyedEnabled
                ? `· from ${provider}, every ${every(intervalSeconds)}`
                : '· not connected yet'}
            </span>
          </h2>
          {!keyedEnabled && (
            <p className="rounded-2xl border border-border-subtle bg-surface-overlay/60 px-4 py-3 text-sm text-pretty text-text-secondary">
              Spot gold, forex and shares need a market-data connection, which this site has not set
              up yet. Crypto above is live now. Until then, the gold token (PAXG) follows the gold
              price closely.
            </p>
          )}
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {keyed.map((i) => (
              <Tile
                key={i.id}
                instrument={i}
                quote={others.quotes[i.id]}
                status={
                  !keyedEnabled
                    ? 'unconnected'
                    : others.errors[i.id] && !others.quotes[i.id]
                      ? { error: others.errors[i.id]! }
                      : others.quotes[i.id]?.marketOpen === false
                        ? 'closed'
                        : others.quotes[i.id]
                          ? {
                              asOf: others.quotes[i.id]!.at ?? 0,
                              stale: others.quotes[i.id]!.stale ?? false,
                            }
                          : 'polled'
                }
                locale={locale}
              />
            ))}
          </ul>
        </section>
      )}

      {instruments.length === 0 && (
        <p className="py-10 text-center text-sm text-text-secondary">
          Your list is empty. Tap Add markets.
        </p>
      )}

      <p className="text-xs text-pretty text-text-muted">
        Prices come from Binance (crypto){keyedEnabled ? ` and ${provider} (the rest)` : ''}. They
        can lag the market and are for watching, not for placing orders. Not financial advice.
      </p>
    </div>
  );
}

function StreamBadge({ state }: { state: StreamState | null }) {
  if (state === null) return <span />;
  const live = state === 'live';
  return (
    <span
      role="status"
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium',
        live
          ? 'border-positive/30 bg-positive-soft text-positive'
          : 'border-border-subtle text-text-secondary',
      )}
    >
      <span
        aria-hidden
        className={cn('size-2 rounded-full', live ? 'nf-live-dot bg-positive' : 'bg-text-muted')}
      />
      {live ? 'Live' : state === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
    </span>
  );
}

type TileStatus =
  | 'live'
  | 'waiting'
  | 'polled'
  | 'closed'
  | 'unconnected'
  | { error: string }
  | { asOf: number; stale: boolean };

function Tile({
  instrument,
  quote,
  status,
  locale,
}: {
  instrument: Instrument;
  quote: Quote | undefined;
  status: TileStatus;
  locale: string;
}) {
  const change = quote?.changePercent ?? null;
  const up = change !== null && change >= 0;

  return (
    <li
      className={cn(
        'relative flex flex-col gap-2 overflow-hidden rounded-2xl border border-border-subtle bg-surface-raised p-4 shadow-(--shadow-edge)',
        (typeof status === 'object' && 'error' in status) || status === 'unconnected'
          ? 'opacity-70'
          : '',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text-primary">{instrument.label}</p>
          <p className="truncate text-xs text-text-muted">{instrument.ticker}</p>
        </div>
        <TileChip status={status} hasQuote={!!quote} locale={locale} />
      </div>

      <p className="numeric text-2xl leading-tight font-semibold tracking-tight text-text-primary sm:text-3xl">
        {quote ? (
          <span
            key={quote.tick}
            data-direction={quote.direction}
            className={cn(
              'rounded-md',
              quote.direction === 'up' && 'nf-tick-up',
              quote.direction === 'down' && 'nf-tick-down',
            )}
          >
            {formatPrice(quote.price, locale)}
          </span>
        ) : (
          <span className="text-text-muted">—</span>
        )}
      </p>

      <div className="flex items-center justify-between gap-3 text-xs">
        {change !== null ? (
          <span
            className={cn(
              'numeric inline-flex items-center gap-0.5 font-medium',
              up ? 'text-positive' : 'text-negative',
            )}
          >
            {up ? (
              <ArrowUpRight aria-hidden className="size-3.5" />
            ) : (
              <ArrowDownRight aria-hidden className="size-3.5" />
            )}
            {up ? '+' : ''}
            {change.toFixed(2)}%
            <span className="ml-1 font-normal text-text-muted">
              {instrument.feed === 'binance' ? '24h' : 'today'}
            </span>
          </span>
        ) : (
          <span />
        )}
        {quote && quote.high !== null && quote.low !== null && (
          <span className="numeric truncate text-text-muted">
            H {formatPrice(quote.high, locale)} · L {formatPrice(quote.low, locale)}
          </span>
        )}
      </div>

      {status !== 'unconnected' && <MiniChart values={quote?.history ?? []} up={up} />}

      {quote?.stale && quote.note && (
        <p className="text-xs text-pretty text-warning">{quote.note}. Showing the last price.</p>
      )}
      {instrument.note && <p className="text-xs text-pretty text-text-muted">{instrument.note}</p>}
    </li>
  );
}

function TileChip({
  status,
  hasQuote,
  locale,
}: {
  status: TileStatus;
  hasQuote: boolean;
  locale: string;
}) {
  const clock = (ms: number) =>
    new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(ms);
  const [text, tone] =
    typeof status === 'object'
      ? 'error' in status
        ? [status.error, 'warn']
        : status.asOf > 0
          ? [
              `${status.stale ? 'As of' : 'Updated'} ${clock(status.asOf)}`,
              status.stale ? 'warn' : 'muted',
            ]
          : ['Updated', 'muted']
      : status === 'live'
        ? hasQuote
          ? ['Live', 'live']
          : ['Waiting…', 'muted']
        : status === 'waiting'
          ? ['Connecting…', 'muted']
          : status === 'polled'
            ? [hasQuote ? 'Updated' : 'Loading…', 'muted']
            : status === 'closed'
              ? ['Market closed', 'muted']
              : ['Not connected', 'muted'];

  return (
    <span
      className={cn(
        'shrink-0 rounded-full border px-2 py-0.5 text-2xs font-medium whitespace-nowrap',
        tone === 'live' && 'border-positive/30 bg-positive-soft text-positive',
        tone === 'warn' && 'border-warning/30 bg-warning-soft text-warning',
        tone === 'muted' && 'border-border-subtle text-text-muted',
      )}
    >
      {text}
    </span>
  );
}

/** The session's ticks as a line: drawn only once there is a line to draw. */
function MiniChart({ values, up }: { values: number[]; up: boolean }) {
  if (values.length < 2) return <div aria-hidden className="h-8" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * 100},${30 - ((v - min) / span) * 28 - 1}`)
    .join(' ');
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      className={cn('h-8 w-full', up ? 'text-positive' : 'text-negative')}
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* --------------------------------------------------------------- picker --- */

const KIND_ORDER: MarketKind[] = ['crypto', 'metal', 'forex', 'india', 'us'];

function Picker({
  watchlist,
  onChange,
}: {
  watchlist: string[];
  onChange: (next: string[]) => void;
}) {
  const [coin, setCoin] = useState('');
  const [coinError, setCoinError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const keyedCount = watchlist.filter((id) => id.startsWith('td:')).length;

  const toggle = (id: string) =>
    onChange(watchlist.includes(id) ? watchlist.filter((x) => x !== id) : [...watchlist, id]);

  const custom = watchlist
    .filter((id) => !CATALOG.some((c) => c.id === id))
    .map(resolveInstrument)
    .filter((i): i is Instrument => !!i);

  return (
    <div className="flex flex-col gap-5">
      {KIND_ORDER.map((kind) => (
        <fieldset key={kind} className="flex flex-col gap-2">
          <legend className="mb-2 text-xs font-semibold tracking-wide text-text-muted uppercase">
            {KIND_LABEL[kind]}
          </legend>
          <div className="flex flex-wrap gap-2">
            {[
              ...CATALOG.filter((c) => c.kind === kind),
              ...custom.filter((c) => c.kind === kind),
            ].map((i) => {
              const on = watchlist.includes(i.id);
              const blocked = !on && i.feed === 'keyed' && keyedCount >= MAX_KEYED;
              return (
                <button
                  key={i.id}
                  type="button"
                  aria-pressed={on}
                  disabled={blocked}
                  onClick={() => toggle(i.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
                    on
                      ? 'border-text-primary bg-text-primary text-surface-sunken'
                      : 'border-border-subtle text-text-secondary hover:border-border-strong hover:text-text-primary',
                    blocked && 'opacity-40',
                  )}
                >
                  {on && <Check aria-hidden className="size-3.5" />}
                  {i.label}
                  <span className={cn('text-xs', on ? 'opacity-70' : 'text-text-muted')}>
                    {i.ticker}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}

      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const id = binanceIdFor(coin);
          if (!id) {
            setCoinError('Type a coin symbol, like DOGE or PEPE.');
            return;
          }
          if (!watchlist.includes(id)) onChange([...watchlist, id]);
          setCoin('');
          setCoinError(null);
          input.current?.focus();
        }}
      >
        <label htmlFor="markets-coin" className="text-sm font-medium text-text-primary">
          Any other coin on Binance
        </label>
        <div className="flex gap-2">
          <input
            ref={input}
            id="markets-coin"
            value={coin}
            onChange={(e) => setCoin(e.target.value)}
            placeholder="DOGE, PEPE, LINK…"
            autoCapitalize="characters"
            className="h-10 min-w-0 flex-1 rounded-[var(--radius-control)] border border-border-subtle bg-surface-inset px-3 text-sm text-text-primary placeholder:text-text-muted"
          />
          <button
            type="button"
            onClick={(e) => e.currentTarget.form?.requestSubmit()}
            className="h-10 rounded-full border border-border-subtle bg-surface-overlay px-4 text-sm text-text-primary"
          >
            Add
          </button>
        </div>
        {coinError && <p className="text-xs text-negative">{coinError}</p>}
        <p className="text-xs text-text-muted">
          Priced in USDT. A coin Binance does not list stays on “Waiting…”.
        </p>
      </form>

      {keyedCount >= MAX_KEYED && (
        <p className="text-xs text-text-muted">
          Up to {MAX_KEYED} from gold, forex and stocks at once, to stay inside the data plan.
        </p>
      )}
    </div>
  );
}
