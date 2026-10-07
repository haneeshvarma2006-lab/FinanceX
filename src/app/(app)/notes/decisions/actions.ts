'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/current-user';
import { fieldErrorsFrom, type FormState } from '@/lib/result';
import * as repo from '@/modules/decisions/repository';
import { decisionReviewSchema, decisionSchema } from '@/modules/decisions/validators';

export type { FormState };

const GONE: FormState = { message: 'That decision no longer exists.', tone: 'error' };

function revalidateAll() {
  revalidatePath('/notes/decisions');
  revalidatePath('/today');
}

export async function createDecisionAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  const parsed = decisionSchema.safeParse({
    title: formData.get('title') ?? '',
    area: formData.get('area') || 'life',
    reasoning: formData.get('reasoning') ?? '',
    expected: formData.get('expected') ?? '',
    confidence: formData.get('confidence') ?? '',
    reviewOn: formData.get('reviewOn') ?? '',
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  await repo.createDecision(user.id, parsed.data);
  revalidateAll();
  return { message: 'Decision logged', tone: 'success' };
}

export async function reviewDecisionAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  const parsed = decisionReviewSchema.safeParse({
    id: formData.get('id'),
    verdict: formData.get('verdict') ?? '',
    outcome: formData.get('outcome') ?? '',
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const row = await repo.reviewDecision(user.id, parsed.data);
  if (!row) return GONE;

  revalidateAll();
  return { message: 'Reviewed', tone: 'success' };
}

export async function reopenDecisionAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const done = await repo.reopenDecision(user.id, String(formData.get('id') ?? ''));
  if (!done) return GONE;

  revalidateAll();
  return { message: 'Reopened', tone: 'success' };
}

export async function deleteDecisionAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const done = await repo.deleteDecision(user.id, String(formData.get('id') ?? ''));
  if (!done) return GONE;

  revalidateAll();
  return { message: 'Deleted', tone: 'success' };
}
