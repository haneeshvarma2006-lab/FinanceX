'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/current-user';
import { fieldErrorsFrom, toFormState, type FormState } from '@/lib/result';

export type { FormState };
import * as repo from '@/modules/finance/repository';
import * as finance from '@/modules/finance/service';
import {
  accountSchema,
  categorySchema,
  subscriptionSchema,
  transactionSchema,
  transferSchema,
} from '@/modules/finance/validators';
import { todayFor } from '@/modules/dashboard/service';
import { parseAmount, type Currency } from '@nestedflow/domain/money';

export async function createAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const parsed = accountSchema.safeParse({
    name: formData.get('name'),
    kind: formData.get('kind'),
    currency: formData.get('currency') || user.baseCurrency,
    openingBalance: formData.get('openingBalance') || '0',
  });

  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  let opening: bigint;
  try {
    opening = parseAmount(parsed.data.openingBalance, parsed.data.currency as Currency);
  } catch (error) {
    return {
      fieldErrors: {
        openingBalance: error instanceof Error ? error.message : 'Invalid amount',
      },
    };
  }

  try {
    await repo.insertAccount(user.id, {
      name: parsed.data.name,
      kind: parsed.data.kind,
      currency: parsed.data.currency,
      openingBalanceMinor: opening,
    });
  } catch {
    // The unique index on (userId, name) is the real guard; this is the message.
    return { fieldErrors: { name: 'You already have an account with that name' } };
  }

  // The whole Finance section: an account added from Scan or Import has to
  // unlock those pages too, not only the overview.
  revalidatePath('/finance', 'layout');
  return { message: 'Account added', tone: 'success' };
}

export async function createCategory(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const parsed = categorySchema.safeParse({
    name: formData.get('name'),
    kind: formData.get('kind'),
  });

  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  try {
    await repo.insertCategory(user.id, parsed.data);
  } catch {
    return { fieldErrors: { name: 'You already have a category with that name' } };
  }

  revalidatePath('/finance');
  return { message: 'Category added', tone: 'success' };
}

export async function createTransaction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const parsed = transactionSchema.safeParse({
    accountId: formData.get('accountId'),
    categoryId: formData.get('categoryId') || undefined,
    occurredOn: formData.get('occurredOn'),
    amount: formData.get('amount'),
    kind: formData.get('kind'),
    description: formData.get('description'),
    merchant: formData.get('merchant') || undefined,
  });

  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const result = await finance.createTransaction(user.id, parsed.data);
  if (!result.ok) return toFormState(result.error);

  revalidatePath('/finance');
  return { message: 'Transaction recorded', tone: 'success' };
}

export async function createTransfer(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const parsed = transferSchema.safeParse({
    fromAccountId: formData.get('fromAccountId'),
    toAccountId: formData.get('toAccountId'),
    occurredOn: formData.get('occurredOn'),
    amount: formData.get('amount'),
    description: formData.get('description') || 'Transfer',
  });

  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const result = await finance.createTransfer(user.id, parsed.data);
  if (!result.ok) return toFormState(result.error);

  revalidatePath('/finance');
  return { message: 'Transfer recorded', tone: 'success' };
}

export async function deleteTransaction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = String(formData.get('id') ?? '');

  const result = await finance.deleteTransaction(user.id, id);
  if (!result.ok) return toFormState(result.error);

  revalidatePath('/finance');
  revalidatePath('/finance/transactions');
  revalidatePath('/finance/insights');
  return { message: 'Deleted', tone: 'success' };
}

/* ------------------------------------------------------------- budgets --- */

export async function setBudget(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const result = await finance.setMonthlyBudget(
    user.id,
    {
      category: String(formData.get('category') ?? ''),
      amount: String(formData.get('amount') ?? ''),
    },
    todayFor(user.timezone),
    user.baseCurrency as Currency,
  );
  if (!result.ok) return toFormState(result.error);

  revalidatePath('/finance', 'layout');
  revalidatePath('/today');
  return { message: 'Budget saved', tone: 'success' };
}

export async function deleteBudget(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const removed = await repo.deleteBudget(user.id, String(formData.get('id') ?? ''));
  if (!removed) return { message: 'That budget no longer exists', tone: 'error' };

  revalidatePath('/finance');
  return { message: 'Budget removed', tone: 'success' };
}

/* ------------------------------------------------------ recurring bills --- */

export async function addRecurring(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = subscriptionSchema.safeParse({
    name: formData.get('name'),
    amount: formData.get('amount'),
    cadence: formData.get('cadence'),
    nextDueOn: formData.get('nextDueOn'),
    accountId: formData.get('accountId') ?? '',
    categoryId: formData.get('categoryId') ?? '',
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const result = await finance.addRecurring(user.id, parsed.data, user.baseCurrency as Currency);
  if (!result.ok) return toFormState(result.error);

  revalidatePath('/finance');
  revalidatePath('/today');
  return { message: 'Recurring bill added', tone: 'success' };
}

export async function payRecurring(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const result = await finance.payRecurring(
    user.id,
    String(formData.get('id') ?? ''),
    todayFor(user.timezone),
  );
  if (!result.ok) return toFormState(result.error);

  revalidatePath('/finance');
  revalidatePath('/today');
  return {
    message: result.value.recorded ? 'Paid and recorded' : 'Marked paid',
    tone: 'success',
  };
}

export async function deleteRecurring(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const removed = await repo.deleteSubscription(user.id, String(formData.get('id') ?? ''));
  if (!removed) return { message: 'That bill no longer exists', tone: 'error' };

  revalidatePath('/finance');
  revalidatePath('/today');
  return { message: 'Recurring bill removed', tone: 'success' };
}
