'use client';

import { useActionState } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, FormAlert, SelectField } from '@/components/ui/form';
import { SUPPORTED_CURRENCIES } from '@nestedflow/domain/money';
import { ACCOUNT_KINDS } from '@/modules/finance/validators';
import {
  addRecurring,
  createAccount,
  createTransaction,
  createTransfer,
  deleteBudget,
  deleteRecurring,
  deleteTransaction,
  payRecurring,
  setBudget,
  type FormState,
} from './actions';
import { CADENCE_LABEL, type Cadence } from '@/modules/finance/recurring';

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
            <option key={kind} value={kind}>
              {kind[0]!.toUpperCase() + kind.slice(1)}
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

      <Button type="submit" loading={pending} className="self-start">
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

      <Button type="submit" loading={pending} className="self-start">
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

/* ------------------------------------------------------------- budgets --- */

export function AddBudgetForm({
  suggestions,
  currency,
}: {
  /** Existing expense categories first, then the common ones. */
  suggestions: string[];
  currency: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(setBudget, {});

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Status state={state} />
      <Field
        label="Category"
        name="category"
        required
        maxLength={80}
        list="budget-categories"
        placeholder="Food, Fuel, Shopping…"
        hint="Pick one or type your own. Setting one again changes its limit."
        error={state.fieldErrors?.category}
      />
      <datalist id="budget-categories">
        {suggestions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <Field
        label={`Monthly limit (${currency})`}
        name="amount"
        required
        inputMode="decimal"
        placeholder="8000"
        error={state.fieldErrors?.amount}
      />
      <Button type="submit" loading={pending}>
        Save budget
      </Button>
    </form>
  );
}

export function DeleteBudgetButton({ id, name }: { id: string; name: string }) {
  const [, action, pending] = useActionState<FormState, FormData>(deleteBudget, {});
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        loading={pending}
        aria-label={`Remove the ${name} budget`}
      >
        <Trash2 aria-hidden className="size-3.5" />
      </Button>
    </form>
  );
}

/* ------------------------------------------------------ recurring bills --- */

export function AddRecurringForm({
  accounts,
  categories,
  today: day,
}: {
  accounts: Account[];
  categories: Category[];
  today: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(addRecurring, {});

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Status state={state} />
      <Field
        label="What is it?"
        name="name"
        required
        maxLength={120}
        placeholder="Netflix, rent, phone bill, gym…"
        error={state.fieldErrors?.name}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Amount"
          name="amount"
          required
          inputMode="decimal"
          placeholder="649"
          error={state.fieldErrors?.amount}
        />
        <SelectField label="How often" name="cadence" defaultValue="monthly">
          {(Object.keys(CADENCE_LABEL) as Cadence[]).map((c) => (
            <option key={c} value={c}>
              {CADENCE_LABEL[c]}
            </option>
          ))}
        </SelectField>
      </div>
      <Field
        label="Next due"
        name="nextDueOn"
        type="date"
        defaultValue={day}
        required
        error={state.fieldErrors?.nextDueOn}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Paid from"
          name="accountId"
          hint={
            accounts.length
              ? 'Paid records the expense here.'
              : 'Add an account to record payments.'
          }
          error={state.fieldErrors?.accountId}
        >
          <option value="">No account</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </SelectField>
        <SelectField label="Category" name="categoryId" error={state.fieldErrors?.categoryId}>
          <option value="">Uncategorised</option>
          {categories
            .filter((c) => c.kind === 'expense')
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </SelectField>
      </div>
      <Button type="submit" loading={pending}>
        Add recurring bill
      </Button>
    </form>
  );
}

export function RecurringActions({ id, name }: { id: string; name: string }) {
  const [payState, pay, paying] = useActionState<FormState, FormData>(payRecurring, {});
  const [, remove, removing] = useActionState<FormState, FormData>(deleteRecurring, {});

  return (
    <div className="flex shrink-0 items-center gap-1">
      <form action={pay}>
        <input type="hidden" name="id" value={id} />
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          loading={paying}
          aria-label={`Mark ${name} paid`}
          title={payState.message}
        >
          <Check aria-hidden className="size-3.5" />
          Paid
        </Button>
      </form>
      <form action={remove}>
        <input type="hidden" name="id" value={id} />
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          loading={removing}
          aria-label={`Remove ${name}`}
        >
          <Trash2 aria-hidden className="size-3.5" />
        </Button>
      </form>
    </div>
  );
}
