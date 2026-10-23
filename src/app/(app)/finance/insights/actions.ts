'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/current-user';
import type { FormState } from '@/lib/result';
import * as finance from '@/modules/finance/service';

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
