'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/current-user';
import type { FormState } from '@/lib/result';
import * as finance from '@/modules/finance/service';
import { todayFor } from '@/modules/dashboard/service';
import type { Currency } from '@nestedflow/domain/money';

const sortSchema = z.object({
  key: z.string().regex(/^[a-z0-9]{1,12}$/, 'That place could not be found'),
  category: z.string().trim().min(1, 'Pick a category').max(60),
});

/** File every uncategorised payment to one place under a category. */
export async function sortPayeeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = sortSchema.safeParse({
    key: formData.get('key'),
    category: formData.get('category'),
  });
  if (!parsed.success) {
    return { message: parsed.error.issues[0]?.message ?? 'Pick a category', tone: 'error' };
  }

  const result = await finance.categorisePayee(user.id, parsed.data.key, parsed.data.category);
  if (!result.ok) return { message: result.error.message, tone: 'error' };

  revalidatePath('/finance/insights');
  revalidatePath('/finance');
  revalidatePath('/today');
  const { changed, category } = result.value;
  return {
    message: `${changed} payment${changed === 1 ? '' : 's'} filed under ${category}`,
    tone: 'success',
  };
}

const trackSchema = z.object({ key: z.string().regex(/^[a-z0-9]{1,12}$/) });

/** Track a payment that comes round monthly as a bill, with reminders. */
export async function trackMonthlyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = trackSchema.safeParse({ key: formData.get('key') });
  if (!parsed.success) return { message: 'That payment could not be found', tone: 'error' };

  const result = await finance.trackMonthly(
    user.id,
    parsed.data.key,
    todayFor(user.timezone),
    user.baseCurrency as Currency,
  );
  if (!result.ok) return { message: result.error.message, tone: 'error' };

  revalidatePath('/finance/insights');
  revalidatePath('/finance');
  revalidatePath('/today');
  return { message: `${result.value.name} is now a bill, with a reminder`, tone: 'success' };
}
