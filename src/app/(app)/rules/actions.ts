'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/current-user';
import { fieldErrorsFrom, toFormState, type FormState } from '@/lib/result';
import { buildTodaySnapshot } from '@/modules/dashboard/service';
import * as engine from '@/modules/rules/engine';
import * as repo from '@/modules/rules/repository';

export type { FormState };

function revalidateAll() {
  revalidatePath('/rules');
  revalidatePath('/today');
}

/**
 * The form carries the config as discrete named fields rather than a JSON
 * blob, so nothing arbitrary reaches the database. The engine re-validates
 * against the catalogue's own schema before storing.
 */
const formSchema = z.object({
  name: z.string().trim().min(1, 'Give the rule a name').max(120),
  triggerType: z.string().trim().min(1, 'Choose a condition').max(48),
  actionType: z.string().trim().min(1, 'Choose an action').max(48),
  count: z.string().trim().max(8).optional(),
  amount: z.string().trim().max(24).optional(),
  title: z.string().trim().max(240).optional(),
  body: z.string().trim().max(300).optional(),
  priority: z.string().trim().max(2).optional(),
  schedule: z.string().trim().max(10).optional(),
});

export async function createRuleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const parsed = formSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const f = parsed.data;

  // Only the keys the chosen trigger/action understand are forwarded.
  const triggerConfig: Record<string, unknown> = {};
  if (f.count) triggerConfig.count = f.count;
  if (f.amount) triggerConfig.amount = f.amount;

  const actionConfig: Record<string, unknown> = {};
  if (f.actionType === 'notify') {
    actionConfig.title = f.title ?? '';
    if (f.body) actionConfig.body = f.body;
  } else {
    actionConfig.title = f.title ?? '';
    actionConfig.priority = f.priority ?? '2';
    actionConfig.schedule = f.schedule ?? 'today';
  }

  const result = await engine.createRule(user.id, {
    name: f.name,
    triggerType: f.triggerType,
    triggerConfig,
    actionType: f.actionType,
    actionConfig,
  });

  if (!result.ok) return toFormState(result.error);

  revalidateAll();
  return { message: 'Rule created', tone: 'success' };
}

export async function toggleRuleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const result = await engine.setEnabled(
    user.id,
    String(formData.get('id') ?? ''),
    formData.get('enabled') !== 'true',
  );
  if (!result.ok) return toFormState(result.error);

  revalidateAll();
  return { message: 'Saved', tone: 'success' };
}

export async function deleteRuleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const result = await engine.removeRule(user.id, String(formData.get('id') ?? ''));
  if (!result.ok) return toFormState(result.error);

  revalidateAll();
  return { message: 'Deleted', tone: 'success' };
}

/** Check what a rule currently sees, without acting on it. */
export async function previewRuleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const snapshot = await buildTodaySnapshot(user.id, user.timezone, user.baseCurrency);
  const result = await engine.previewRule(user.id, String(formData.get('id') ?? ''), snapshot);

  if (!result.ok) return toFormState(result.error);

  return {
    message: result.value.matched
      ? `Would fire now — ${result.value.reason}`
      : `Would not fire — ${result.value.reason}`,
    tone: result.value.matched ? 'success' : 'error',
  };
}

export async function pruneRunsAction(): Promise<FormState> {
  const user = await requireUser();
  const removed = await repo.pruneRuns(user.id, 20);

  revalidateAll();
  return { message: `${removed} old entries cleared`, tone: 'success' };
}
