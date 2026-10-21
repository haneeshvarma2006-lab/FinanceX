'use client';

import { useActionState, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Briefcase, Trash2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Field, FormAlert, SelectField } from '@/components/ui/form';
import { Sheet } from '@/components/ui/sheet';
import { EmptyState } from '@/components/ui/states';
import type { FormState } from '@/lib/result';
import {
  CATALOG,
  formatPrice,
  formatQuantity,
  KIND_LABEL,
  resolveInstrument,
  type Instrument,
  type MarketKind,
} from '@/modules/markets/catalog';
import {
  formatValue,
  isMetal,
  quoteCurrency,
  totals,
  valueHolding,
  type HoldingUnit,
} from '@/modules/markets/portfolio';
import { addHolding, deleteHolding } from '../markets/actions';
import { useBinance, useKeyed } from '../markets/feeds';

type HoldingView = {
  id: string;
  instrumentId: string;
  quantity: string;
  unit: HoldingUnit;
  averagePrice: string | null;
  note: string | null;
};

const USD_INR = 'td:USD/INR';

export function PortfolioView({
  holdings,
  provider,
  intervalSeconds,
  locale,
  home,
}: {
  holdings: HoldingView[];
  provider: string | null;
  intervalSeconds: number;
  locale: string;
  home: string;
}) {
  const keyedEnabled = provider !== null;
  const instruments = new Map(
    holdings
      .map((h) => resolveInstrument(h.instrumentId))
      .filter((i): i is Instrument => !!i)
      .map((i) => [i.id, i]),
  );
  const cryptoSymbols = [...instruments.values()]
    .filter((i) => i.feed === 'binance')
    .map((i) => i.id.slice(3));
  const holdsUsd = [...instruments.values()].some((i) => quoteCurrency(i) === 'USD');
  const keyedIds = [
    ...[...instruments.values()].filter((i) => i.feed === 'keyed').map((i) => i.id),
    // The rupee rate, to add dollar holdings into one total.
    ...(home === 'INR' && holdsUsd && keyedEnabled && !instruments.has(USD_INR) ? [USD_INR] : []),
  ];

  const binance = useBinance(cryptoSymbols);
  const keyed = useKeyed(keyedIds, keyedEnabled, intervalSeconds);
  const priceOf = (i: Instrument) =>
    i.feed === 'binance' ? binance.quotes[i.id.slice(3)]?.price : keyed.quotes[i.id]?.price;

  const rows = holdings.map((h) => {
    const instrument = instruments.get(h.instrumentId) ?? null;
    const price = instrument ? priceOf(instrument) : undefined;
    const quantity = Number(h.quantity);
    const valuation =
      price === undefined
        ? null
        : valueHolding(
            {
              quantity,
              unit: h.unit,
              averagePrice: h.averagePrice === null ? null : Number(h.averagePrice),
            },
            h.instrumentId,
            price,
          );
    return { h, instrument, price, quantity, valuation };
  });

  const usdToHome = home === 'USD' ? 1 : (keyed.quotes[USD_INR]?.price ?? null);
  const sum = totals(
    rows.flatMap(({ instrument, valuation }) =>
      instrument && valuation
        ? [{ currency: quoteCurrency(instrument), value: valuation.value, cost: valuation.cost }]
        : [],
    ),
    home,
    home === 'INR' ? usdToHome : home === 'USD' ? 1 : null,
  );
  const unpriced = rows.filter((r) => !r.valuation).length;

  return (
    <div className="flex flex-col gap-6">
      {/* ------------------------------------------------------------ total */}
      <section
        aria-label="Portfolio total"
        className="flex flex-col gap-4 rounded-2xl border border-border-subtle bg-surface-raised p-5 shadow-(--shadow-edge) sm:flex-row sm:items-end sm:justify-between"
      >
        <div className="min-w-0">
          <p className="text-2xs font-medium tracking-wide text-text-muted uppercase">
            Total value
          </p>
          {holdings.length === 0 ? (
            <p className="numeric mt-2 text-3xl font-semibold text-text-muted">—</p>
          ) : sum.inHome !== null && sum.byCurrency.size > 0 ? (
            <p className="numeric mt-2 text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
              {formatValue(sum.inHome, home, locale)}
            </p>
          ) : (
            <div className="mt-2 flex flex-col gap-1">
              {[...sum.byCurrency].map(([currency, t]) => (
                <p
                  key={currency}
                  className="numeric text-2xl font-semibold tracking-tight text-text-primary"
                >
                  {formatValue(t.value, currency, locale)}
                </p>
              ))}
              {sum.byCurrency.size === 0 && (
                <p className="numeric text-3xl font-semibold text-text-muted">—</p>
              )}
            </div>
          )}
          <p className="mt-1 text-xs text-text-muted">
            {holdings.length === 0
              ? 'Add what you hold to see it valued live.'
              : unpriced > 0
                ? `${unpriced} holding${unpriced === 1 ? '' : 's'} waiting for a price.`
                : sum.inHome !== null && sum.byCurrency.size > 1
                  ? 'Dollar holdings converted at the live USD/INR rate. USDT counted as USD.'
                  : 'At the latest prices.'}
          </p>
        </div>
        <Sheet
          label="Add holding"
          description="What you own and, if you like, what you paid."
          className="w-full sm:w-auto"
        >
          <HoldingForm />
        </Sheet>
      </section>

      {/* --------------------------------------------------------- holdings */}
      {holdings.length === 0 ? (
        <div className="rounded-2xl border border-border-subtle bg-surface-raised">
          <EmptyState
            icon={<Briefcase aria-hidden className="size-5" />}
            title="No holdings yet"
            description="0.05 BTC, 10 grams of gold, 20 Reliance shares: add them and watch their value move."
          />
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {rows.map(({ h, instrument, price, quantity, valuation }) => {
            const name = instrument?.label ?? h.instrumentId.slice(3);
            const currency = instrument ? quoteCurrency(instrument) : 'USD';
            const unitLabel =
              h.unit === 'gram'
                ? ' g'
                : h.unit === 'ounce'
                  ? ' oz'
                  : ` ${instrument?.ticker.split('/')[0] ?? ''}`;
            const up = (valuation?.gain ?? 0) >= 0;
            const needsKey = instrument?.feed === 'keyed' && !keyedEnabled;
            return (
              <li
                key={h.id}
                className="flex flex-col gap-3 rounded-2xl border border-border-subtle bg-surface-raised p-4 shadow-(--shadow-edge)"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-text-primary">{name}</p>
                    <p className="numeric truncate text-xs text-text-muted">
                      {formatQuantity(quantity, locale)}
                      {unitLabel}
                      {h.note ? ` · ${h.note}` : ''}
                    </p>
                  </div>
                  <form action={deleteHolding}>
                    <input type="hidden" name="id" value={h.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove ${name} from portfolio`}
                    >
                      <Trash2 aria-hidden className="size-3.5" />
                    </Button>
                  </form>
                </div>

                <p className="numeric text-2xl leading-tight font-semibold tracking-tight text-text-primary">
                  {valuation ? (
                    formatValue(valuation.value, currency, locale)
                  ) : (
                    <span className="text-text-muted">—</span>
                  )}
                </p>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  {valuation?.gain !== null && valuation?.gain !== undefined ? (
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
                      {up ? '+' : '−'}
                      {formatValue(Math.abs(valuation.gain), currency, locale)}
                      {valuation.gainPercent !== null &&
                        ` (${up ? '+' : '−'}${Math.abs(valuation.gainPercent).toFixed(2)}%)`}
                    </span>
                  ) : (
                    <span className="text-text-muted">
                      {needsKey
                        ? 'Needs a market-data connection'
                        : price === undefined
                          ? 'Waiting for a price…'
                          : 'Add what you paid to see profit'}
                    </span>
                  )}
                  {price !== undefined && (
                    <span className="numeric text-text-muted">
                      @ {formatPrice(price, locale)}
                      {instrument && isMetal(instrument.id) ? ' / oz' : ''}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-pretty text-text-muted">
        Values use the same prices as Live markets: Binance for crypto
        {provider ? `, ${provider} for the rest` : ''}. Shown for tracking only, not as a valuation
        for tax or advice.
      </p>
    </div>
  );
}

const KIND_ORDER: MarketKind[] = ['crypto', 'metal', 'india', 'us', 'forex'];

function HoldingForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(addHolding, {});
  const [instrumentId, setInstrumentId] = useState('bn:BTCUSDT');
  const metal = isMetal(instrumentId);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.message && (
        <FormAlert tone={state.tone === 'success' ? 'success' : 'error'}>{state.message}</FormAlert>
      )}
      <SelectField
        label="Market"
        name="instrumentId"
        value={instrumentId}
        onChange={(e) => setInstrumentId(e.target.value)}
        error={state.fieldErrors?.instrumentId}
      >
        {KIND_ORDER.map((kind) => (
          <optgroup key={kind} label={KIND_LABEL[kind]}>
            {CATALOG.filter((c) => c.kind === kind).map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} ({c.ticker})
              </option>
            ))}
          </optgroup>
        ))}
      </SelectField>
      <Field
        label="Or another coin on Binance"
        name="coin"
        placeholder="DOGE, PEPE, LINK…"
        autoCapitalize="characters"
        hint="Leave empty to use the market above."
      />
      <div className={cn('grid gap-3', metal && 'grid-cols-2')}>
        <Field
          label="How much"
          name="quantity"
          inputMode="decimal"
          required
          placeholder={metal ? '10' : '0.05'}
          error={state.fieldErrors?.quantity}
        />
        {metal ? (
          <SelectField label="In" name="unit" defaultValue="gram">
            <option value="gram">Grams</option>
            <option value="ounce">Troy ounces</option>
          </SelectField>
        ) : (
          <input type="hidden" name="unit" value="unit" />
        )}
      </div>
      <Field
        label={metal ? 'Paid per gram or ounce (optional)' : 'Paid per unit (optional)'}
        name="averagePrice"
        inputMode="decimal"
        placeholder="For profit and loss"
        hint="In the market's currency: dollars for crypto and gold, rupees for Indian shares."
        error={state.fieldErrors?.averagePrice}
      />
      <Field label="Note (optional)" name="note" maxLength={120} placeholder="Zerodha, Ledger…" />
      <Button type="submit" loading={pending}>
        Add to portfolio
      </Button>
    </form>
  );
}
