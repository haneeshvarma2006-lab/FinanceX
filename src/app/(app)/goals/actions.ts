'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/current-user';
import { fieldErrorsFrom, toFormState, type FormState } from '@/lib/result';
import * as repo from '@/modules/productivity/repository';
import * as productivity from '@/modules/productivity/service';
import { checkpointSchema, goalSchema } from '@/modules/productivity/validators';

export type { FormState };

function revalidateAll() {
  revalidatePath('/goals');
  revalidatePath('/today');
}

export async function createGoalAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const parsed = goalSchema.safeParse({
    title: formData.get('title'),
    description: formData.get('description') || undefined,
    kind: formData.get('kind') || 'numeric',
    targetValue: formData.get('targetValue'),
    unit: formData.get('unit') || undefined,
    currency: formData.get('currency') || undefined,
    habitId: formData.get('habitId') || undefined,
    startsOn: formData.get('startsOn') || undefined,
    targetDate: formData.get('targetDate') || undefined,
  });

  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const result = await productivity.createGoal(user.id, parsed.data);
  if (!result.ok) return toFormState(result.error);

  revalidateAll();
  return { message: 'Goal added', tone: 'success' };
}

export async function recordCheckpointAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  const parsed = checkpointSchema.safeParse({
    goalId: formData.get('goalId'),
    value: formData.get('value'),
    note: formData.get('note') || undefined,
  });

  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const result = await productivity.recordCheckpoint(user.id, parsed.data);
  if (!result.ok) return toFormState(result.error);

  revalidateAll();
  return {
    message: result.value.status === 'achieved' ? 'Target reached' : 'Progress recorded',
    tone: 'success',
  };
}

export async function deleteGoalAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const deleted = await repo.deleteGoal(user.id, String(formData.get('id') ?? ''));
  if (!deleted) return { message: 'That goal no longer exists.', tone: 'error' };

  revalidateAll();
  return { message: 'Deleted', tone: 'success' };
}
