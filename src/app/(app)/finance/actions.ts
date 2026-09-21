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
  transactionSchema,
  transferSchema,
} from '@/modules/finance/validators';
import { parseAmount, type Currency } from '@/lib/money';

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

  revalidatePath('/finance');
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
  return { message: 'Deleted', tone: 'success' };
}
