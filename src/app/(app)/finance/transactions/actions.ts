'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/current-user';
import type { FormState } from '@/lib/result';
import * as finance from '@/modules/finance/service';

const schema = z.object({
  id: z.string().length(36),
  category: z.string().trim().max(60),
});

/** Move one payment to a category, or out of any with an empty choice. */
export async function recategoriseAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = schema.safeParse({ id: formData.get('id'), category: formData.get('category') });
  if (!parsed.success) return { message: 'That change could not be saved', tone: 'error' };

  const result = await finance.setTransactionCategory(
    user.id,
    parsed.data.id,
    parsed.data.category || null,
  );
  if (!result.ok) return { message: result.error.message, tone: 'error' };

  revalidatePath('/finance/transactions');
  revalidatePath('/finance/insights');
  revalidatePath('/finance');
  return { message: 'Saved', tone: 'success' };
}
