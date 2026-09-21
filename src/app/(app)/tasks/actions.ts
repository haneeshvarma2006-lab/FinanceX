'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/current-user';
import { fieldErrorsFrom, toFormState, type FormState } from '@/lib/result';
import * as repo from '@/modules/productivity/repository';
import * as productivity from '@/modules/productivity/service';
import { projectSchema, taskSchema } from '@/modules/productivity/validators';

export type { FormState };

/** Every list this touches, revalidated together so nothing shows stale counts. */
function revalidateAll() {
  revalidatePath('/tasks');
  revalidatePath('/today');
}

export async function createTaskAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const parsed = taskSchema.safeParse({
    title: formData.get('title'),
    notes: formData.get('notes') || undefined,
    projectId: formData.get('projectId') || undefined,
    priority: formData.get('priority') || 3,
    dueAt: formData.get('dueAt') || undefined,
    scheduledFor: formData.get('scheduledFor') || undefined,
    estimateMinutes: formData.get('estimateMinutes') || undefined,
    repeat: formData.get('repeat') || undefined,
    repeatInterval: formData.get('repeatInterval') || 1,
  });

  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const result = await productivity.createTask(user.id, parsed.data);
  if (!result.ok) return toFormState(result.error);

  revalidateAll();
  return { message: 'Task added', tone: 'success' };
}

export async function completeTaskAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = String(formData.get('id') ?? '');

  const result = await productivity.completeTask(user.id, id);
  if (!result.ok) return toFormState(result.error);

  revalidateAll();

  /**
   * Returned for the caller's benefit, but note the completing row unmounts
   * when the list revalidates, so this message is generally not seen. The
   * successor explains itself in the list instead: it carries a "repeats"
   * badge and its new date. If a durable confirmation is wanted later, it
   * needs a page-level flash region rather than per-row action state.
   */
  return {
    message: result.value.nextOccurrence
      ? `Done — next one scheduled for ${result.value.nextOccurrence.scheduledFor ?? 'later'}`
      : 'Done',
    tone: 'success',
  };
}

export async function reopenTaskAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const result = await productivity.reopenTask(user.id, String(formData.get('id') ?? ''));
  if (!result.ok) return toFormState(result.error);

  revalidateAll();
  return { message: 'Reopened', tone: 'success' };
}

export async function deleteTaskAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const result = await productivity.deleteTask(user.id, String(formData.get('id') ?? ''));
  if (!result.ok) return toFormState(result.error);

  revalidateAll();
  return { message: 'Deleted', tone: 'success' };
}

export async function createProjectAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  const parsed = projectSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description') || undefined,
  });

  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const result = await productivity.createProject(user.id, parsed.data);
  if (!result.ok) return toFormState(result.error);

  revalidateAll();
  return { message: 'Project added', tone: 'success' };
}

export async function archiveProjectAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const archived = await repo.archiveProject(user.id, String(formData.get('id') ?? ''));
  if (!archived) return { message: 'That project no longer exists.', tone: 'error' };

  revalidateAll();
  return { message: 'Project archived', tone: 'success' };
}
