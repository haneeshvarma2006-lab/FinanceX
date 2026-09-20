'use client';

import { useActionState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, FormAlert, SelectField } from '@/components/ui/form';
import { SUPPORTED_CURRENCIES } from '@/lib/money';
import { ACCOUNT_KINDS } from '@/modules/finance/validators';
import {
  createAccount,
  createTransaction,
  createTransfer,
  deleteTransaction,
  type FormState,
} from './actions';

type Account = { id: string; name: string; currency: string };
type Category = { id: string; name: string; kind: string };

const today = () => new Date().toISOString().slice(0, 10);

function Status({ state }: { state: FormState }) {
  if (!state.message) return null;
  return (
    <FormAlert tone={state.tone === 'success' ? 'success' : 'error'}>{state.message}</FormAlert>
  );
}

export function AddAccountForm({ defaultCurrency }: { defaultCurrency: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createAccount, {});

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Status state={state} />

      <Field label="Name" name="name" required maxLength={120} error={state.fieldErrors?.name} />

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Type" name="kind" defaultValue="bank" error={state.fieldErrors?.kind}>
          {ACCOUNT_KINDS.map((kind) => (
            <option key={kind} value={kind} className="capitalize">
              {kind}
            </option>
          ))}
        </SelectField>

        <SelectField
          label="Currency"
          name="currency"
          defaultValue={defaultCurrency}
          error={state.fieldErrors?.currency}
        >
          {SUPPORTED_CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </SelectField>
      </div>

      <Field
        label="Opening balance"
        name="openingBalance"
        defaultValue="0"
        inputMode="decimal"
        hint="What the account holds today. Leave at 0 if you are starting fresh."
        error={state.fieldErrors?.openingBalance}
      />

      <Button type="submit" loading={pending}>
        Add account
      </Button>
    </form>
  );
}

export function AddTransactionForm({
  accounts,
  categories,
}: {
  accounts: Account[];
  categories: Category[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(createTransaction, {});

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Status state={state} />

      <Field
        label="Description"
        name="description"
        required
        maxLength={240}
        error={state.fieldErrors?.description}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Type"
          name="kind"
          defaultValue="expense"
          error={state.fieldErrors?.kind}
        >
          <option value="expense">Expense</option>
          <option value="income">Income</option>
        </SelectField>

        <Field
          label="Amount"
          name="amount"
          required
          inputMode="decimal"
          placeholder="0.00"
          hint="A positive number — the type above sets the direction."
          error={state.fieldErrors?.amount}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Account" name="accountId" error={state.fieldErrors?.accountId}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </SelectField>

        <SelectField label="Category" name="categoryId" error={state.fieldErrors?.categoryId}>
          <option value="">Uncategorised</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.kind})
            </option>
          ))}
        </SelectField>
      </div>

      <Field
        label="Date"
        name="occurredOn"
        type="date"
        defaultValue={today()}
        required
        error={state.fieldErrors?.occurredOn}
      />

      <Button type="submit" loading={pending}>
        Record transaction
      </Button>
    </form>
  );
}

export function AddTransferForm({ accounts }: { accounts: Account[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createTransfer, {});

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Status state={state} />

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="From" name="fromAccountId" error={state.fieldErrors?.fromAccountId}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.currency})
            </option>
          ))}
        </SelectField>

        <SelectField
          label="To"
          name="toAccountId"
          defaultValue={accounts[1]?.id}
          error={state.fieldErrors?.toAccountId}
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.currency})
            </option>
          ))}
        </SelectField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Amount"
          name="amount"
          required
          inputMode="decimal"
          error={state.fieldErrors?.amount}
        />
        <Field
          label="Date"
          name="occurredOn"
          type="date"
          defaultValue={today()}
          required
          error={state.fieldErrors?.occurredOn}
        />
      </div>

      <Field label="Description" name="description" defaultValue="Transfer" maxLength={240} />

      <Button type="submit" variant="secondary" loading={pending}>
        Record transfer
      </Button>
    </form>
  );
}

export function DeleteTransactionButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(deleteTransaction, {});

  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        loading={pending}
        aria-label="Delete transaction"
        title={state.message ?? 'Delete'}
      >
        <Trash2 aria-hidden className="size-3.5" />
      </Button>
    </form>
  );
}
