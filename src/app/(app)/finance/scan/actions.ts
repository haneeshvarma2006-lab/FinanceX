'use server';

import { requireUser } from '@/lib/auth/current-user';
import * as repo from '@/modules/finance/repository';

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
