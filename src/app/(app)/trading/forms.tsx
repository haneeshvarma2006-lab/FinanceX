'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FormAlert, SelectField, TextareaField } from '@/components/ui/form';
import { cn } from '@/lib/cn';
import { SUPPORTED_CURRENCIES } from '@nestedflow/domain/money';
import {
  ASSET_CLASSES,
  COSTLY_EMOTIONS,
  EMOTION_LABELS,
  EMOTIONS,
  TRADE_ENVIRONMENTS,
} from '@/modules/trading/validators';
import {
  addExecution,
  addNoteAction,
  createStrategy,
  createTrade,
  createTradingAccount,
  type FormState,
} from './actions';

type Account = { id: string; name: string; currency: string; environment: string };
type Strategy = { id: string; name: string };

function Status({ state }: { state: FormState }) {
  if (!state.message) return null;
  return (
    <FormAlert tone={state.tone === 'success' ? 'success' : 'error'}>{state.message}</FormAlert>
  );
}

const nowLocal = () => new Date().toISOString().slice(0, 16);

export function AddTradingAccountForm({ defaultCurrency }: { defaultCurrency: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createTradingAccount, {});

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Status state={state} />

      <Field label="Name" name="name" required maxLength={120} error={state.fieldErrors?.name} />
      <Field
        label="Broker"
        name="broker"
        maxLength={120}
        hint="Optional — for your reference only."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Environment"
          name="environment"
          defaultValue="live"
          hint="Paper and live results are kept apart."
          error={state.fieldErrors?.environment}
        >
          {TRADE_ENVIRONMENTS.map((e) => (
            <option key={e} value={e} className="capitalize">
              {e}
            </option>
          ))}
        </SelectField>

        <SelectField label="Currency" name="currency" defaultValue={defaultCurrency}>
          {SUPPORTED_CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </SelectField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Starting balance"
          name="startingBalance"
          defaultValue="0"
          inputMode="decimal"
          error={state.fieldErrors?.startingBalance}
        />
        <Field
          label="Risk per trade (%)"
          name="riskPerTradePercent"
          type="number"
          step="0.1"
          min="0"
          max="100"
          defaultValue="1"
          error={state.fieldErrors?.riskPerTradePercent}
        />
      </div>

      <Button type="submit" loading={pending} className="self-start">
        Add trading account
      </Button>
    </form>
  );
}

export function AddTradeForm({
  accounts,
  strategies,
}: {
  accounts: Account[];
  strategies: Strategy[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(createTrade, {});

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Status state={state} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Symbol"
          name="symbol"
          required
          maxLength={32}
          placeholder="INFY"
          error={state.fieldErrors?.symbol}
        />
        <SelectField label="Direction" name="direction" defaultValue="long">
          <option value="long">Long</option>
          <option value="short">Short</option>
        </SelectField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Account" name="tradingAccountId">
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.environment})
            </option>
          ))}
        </SelectField>

        <SelectField label="Asset class" name="assetClass" defaultValue="equity">
          {ASSET_CLASSES.map((a) => (
            <option key={a} value={a} className="capitalize">
              {a}
            </option>
          ))}
        </SelectField>
      </div>

      <SelectField
        label="Setup"
        name="strategyId"
        hint={strategies.length === 0 ? 'Add your setups below to compare them.' : undefined}
      >
        <option value="">No setup</option>
        {strategies.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </SelectField>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Stop"
          name="stopPrice"
          inputMode="decimal"
          error={state.fieldErrors?.stopPrice}
        />
        <Field
          label="Target"
          name="targetPrice"
          inputMode="decimal"
          error={state.fieldErrors?.targetPrice}
        />
        <Field
          label="Planned risk"
          name="plannedRisk"
          inputMode="decimal"
          hint="For R-multiple."
          error={state.fieldErrors?.plannedRisk}
        />
      </div>

      <Field
        label="Chart link"
        name="chartUrl"
        type="url"
        inputMode="url"
        placeholder="https://www.tradingview.com/x/…"
        hint="Optional. A snapshot you saved, to look back at later."
        error={state.fieldErrors?.chartUrl}
      />

      <Button type="submit" loading={pending} className="self-start">
        Log trade
      </Button>
    </form>
  );
}

export function AddExecutionForm({ tradeId }: { tradeId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addExecution, {});

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="tradeId" value={tradeId} />
      <Status state={state} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <SelectField label="Side" name="side" defaultValue="buy">
          <option value="buy">Buy</option>
          <option value="sell">Sell</option>
        </SelectField>

        <Field
          label="Quantity"
          name="quantity"
          required
          inputMode="decimal"
          error={state.fieldErrors?.quantity}
        />
        <Field
          label="Price"
          name="price"
          required
          inputMode="decimal"
          error={state.fieldErrors?.price}
        />
        <Field
          label="Fee"
          name="fee"
          defaultValue="0"
          inputMode="decimal"
          error={state.fieldErrors?.fee}
        />
        <Field
          label="Executed at"
          name="executedAt"
          type="datetime-local"
          defaultValue={nowLocal()}
          required
          error={state.fieldErrors?.executedAt}
        />
      </div>

      <div>
        <Button type="submit" size="sm" variant="secondary" loading={pending}>
          Add execution
        </Button>
      </div>
    </form>
  );
}

export function AddSetupForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createStrategy, {});

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Status state={state} />
      <Field
        label="Setup title"
        name="name"
        required
        maxLength={120}
        placeholder="Opening range breakout"
        error={state.fieldErrors?.name}
      />
      <TextareaField
        label="Rules"
        name="rules"
        rows={3}
        maxLength={8000}
        placeholder="When it qualifies, where the stop goes, when you take profit."
      />
      <Button type="submit" variant="secondary" loading={pending} className="self-start">
        Add setup
      </Button>
    </form>
  );
}

/**
 * One journal entry for a trade: what you thought, what happened, and how
 * you felt. The feeling is a single tap, because it is the thing people
 * skip when it takes typing — and it is the thing the journal learns from.
 */
export function AddNoteForm({ tradeId }: { tradeId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addNoteAction, {});
  const [emotion, setEmotion] = useState('');

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="tradeId" value={tradeId} />
      <input type="hidden" name="emotionTag" value={emotion} />
      <Status state={state} />

      <fieldset>
        <legend className="mb-2 text-xs font-medium text-text-secondary">How did you feel?</legend>
        <div className="flex flex-wrap gap-1.5">
          {EMOTIONS.map((e) => {
            const selected = emotion === e;
            const costly = COSTLY_EMOTIONS.includes(e);
            return (
              <button
                key={e}
                type="button"
                aria-pressed={selected}
                onClick={() => setEmotion(selected ? '' : e)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs transition-colors duration-[var(--duration-fast)]',
                  selected
                    ? costly
                      ? 'border-negative/50 bg-negative-soft text-negative'
                      : 'border-positive/50 bg-positive-soft text-positive'
                    : 'border-border-subtle text-text-secondary hover:border-border-strong hover:text-text-primary',
                )}
              >
                {EMOTION_LABELS[e]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label="Entry type" name="kind" defaultValue="review">
          <option value="thesis">Plan — why I took it</option>
          <option value="review">Review — what happened</option>
          <option value="psychology">Psychology — what I felt</option>
        </SelectField>
        <SelectField label="Conviction" name="confidence" defaultValue="">
          <option value="">Not rated</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n} of 5
            </option>
          ))}
        </SelectField>
      </div>

      <TextareaField
        label="Notes"
        name="body"
        rows={3}
        maxLength={8000}
        required
        placeholder="Followed the plan? Moved the stop? What would you do differently?"
        error={state.fieldErrors?.body}
      />

      <div>
        <Button type="submit" size="sm" variant="secondary" loading={pending}>
          Add to journal
        </Button>
      </div>
    </form>
  );
}
