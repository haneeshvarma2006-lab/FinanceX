'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FormAlert, SelectField } from '@/components/ui/form';
import { SUPPORTED_CURRENCIES } from '@nestedflow/domain/money';
import { ASSET_CLASSES, TRADE_ENVIRONMENTS } from '@/modules/trading/validators';
import { addExecution, createTrade, createTradingAccount, type FormState } from './actions';

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

      <SelectField label="Strategy" name="strategyId">
        <option value="">None</option>
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
