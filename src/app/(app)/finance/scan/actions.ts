'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/current-user';
import { fieldErrorsFrom, toFormState } from '@/lib/result';
import * as bills from '@/modules/finance/bills';
import * as repo from '@/modules/finance/repository';
import * as finance from '@/modules/finance/service';
import { transactionSchema } from '@/modules/finance/validators';

export type BillMatch = {
  id: string;
  occurredOn: string;
  description: string;
  accountName: string;
};

const WINDOW_DAYS = 3;

function shift(isoDay: string, days: number): string {
  return new Date(Date.parse(`${isoDay}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Has this bill already been recorded? Only the amount and the date leave the
 * phone — never the photo or the text read from it.
 */
export async function findBillMatchesAction(
  amountMinor: string,
  date: string,
): Promise<BillMatch[]> {
  const user = await requireUser();
  if (!/^\d{1,15}$/.test(amountMinor) || amountMinor === '0') return [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return [];
  return repo.expensesNear(
    user.id,
    BigInt(amountMinor),
    shift(date, -WINDOW_DAYS),
    shift(date, WINDOW_DAYS),
  );
}

export type SaveBillState = {
  message?: string;
  tone?: 'success' | 'error';
  fieldErrors?: Record<string, string>;
};

/**
 * Save a scanned bill: record it as a new expense, or attach it to one that
 * already exists — and keep its photo, if the user chose to.
 */
export async function saveScannedBillAction(
  _prev: SaveBillState,
  formData: FormData,
): Promise<SaveBillState> {
  const user = await requireUser();
  const attachTo = String(formData.get('attachTo') ?? '');
  const photo = formData.get('photo');
  const keepPhoto = formData.get('keepPhoto') === 'on' && photo instanceof File && photo.size > 0;

  let transactionId: string;
  let amountMinor: bigint | null = null;
  let currency: string | null = null;
  let billDate: string | null = null;
  let merchant: string | null = null;

  if (attachTo) {
    const existing = await repo.findTransaction(user.id, attachTo);
    if (!existing) return { message: 'That expense no longer exists.', tone: 'error' };
    if (!keepPhoto) return { message: 'Nothing to attach.', tone: 'error' };
    transactionId = existing.id;
    amountMinor = existing.amountMinor < 0n ? -existing.amountMinor : existing.amountMinor;
    currency = existing.currency;
    billDate = existing.occurredOn;
    merchant = existing.description;
  } else {
    const parsed = transactionSchema.safeParse({
      accountId: formData.get('accountId'),
      categoryId: formData.get('categoryId') || undefined,
      occurredOn: formData.get('occurredOn'),
      amount: formData.get('amount'),
      kind: 'expense',
      description: formData.get('description'),
    });
    if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };
    const created = await finance.createTransaction(user.id, parsed.data);
    if (!created.ok) return toFormState(created.error) as SaveBillState;
    transactionId = created.value.id;
    amountMinor = -created.value.amountMinor;
    currency = created.value.currency;
    billDate = created.value.occurredOn;
    merchant = created.value.description;
  }

  revalidatePath('/finance');
  revalidatePath('/finance/bills');

  if (!keepPhoto) {
    return { message: attachTo ? 'Done.' : 'Expense added.', tone: 'success' };
  }

  const saved = await bills.saveBillPhoto(user.id, {
    bytes: new Uint8Array(await (photo as File).arrayBuffer()),
    transactionId,
    merchant,
    amountMinor,
    currency,
    billDate,
  });

  if (!saved.ok) {
    return {
      message: attachTo
        ? `The photo could not be attached: ${saved.error.message}`
        : `Expense added, but the photo could not be saved: ${saved.error.message}`,
      tone: attachTo ? 'error' : 'success',
    };
  }
  return {
    message: attachTo ? 'Photo attached to that expense.' : 'Expense added with its bill photo.',
    tone: 'success',
  };
}

/** Delete a kept bill photo. The expense it belonged to stays. */
export async function deleteBillAction(id: string): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const result = await bills.deleteBillPhoto(user.id, String(id));
  revalidatePath('/finance');
  revalidatePath('/finance/bills');
  return { ok: result.ok };
}
