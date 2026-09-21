'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/current-user';
import { fieldErrorsFrom, toFormState, type FormState } from '@/lib/result';
import * as repo from '@/modules/productivity/repository';
import * as productivity from '@/modules/productivity/service';
import { habitEntrySchema, habitSchema } from '@/modules/productivity/validators';

export type { FormState };

function revalidateAll() {
  revalidatePath('/habits');
  revalidatePath('/today');
}

export async function createHabitAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const parsed = habitSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description') || undefined,
    cadence: formData.get('cadence') || 'daily',
    targetPerPeriod: formData.get('targetPerPeriod') || 1,
  });

  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const result = await productivity.createHabit(user.id, parsed.data);
  if (!result.ok) return toFormState(result.error);

  revalidateAll();
  return { message: 'Habit added', tone: 'success' };
}

/**
 * Toggle today's entry.
 *
 * Idempotent on the way in (the upsert) and explicit on the way out (a delete),
 * so a double tap can never produce two entries or a half-logged day.
 */
export async function toggleHabitAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const parsed = habitEntrySchema.safeParse({
    habitId: formData.get('habitId'),
    onDate: formData.get('onDate'),
    count: 1,
  });

  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const alreadyLogged = formData.get('logged') === 'true';

  const result = alreadyLogged
    ? await productivity.unlogHabit(user.id, parsed.data.habitId, parsed.data.onDate)
    : await productivity.logHabit(user.id, parsed.data);

  if (!result.ok) return toFormState(result.error);

  revalidateAll();
  return { message: alreadyLogged ? 'Removed' : 'Logged', tone: 'success' };
}

export async function archiveHabitAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const archived = await repo.archiveHabit(user.id, String(formData.get('id') ?? ''));
  if (!archived) return { message: 'That habit no longer exists.', tone: 'error' };

  revalidateAll();
  return { message: 'Archived', tone: 'success' };
}
