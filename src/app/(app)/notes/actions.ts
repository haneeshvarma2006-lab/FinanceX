'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/current-user';
import { fieldErrorsFrom, type FormState } from '@/lib/result';
import * as repo from '@/modules/notes/repository';
import { noteSchema, noteUpdateSchema } from '@/modules/notes/validators';

export type { FormState };

const GONE: FormState = { message: 'That note no longer exists.', tone: 'error' };

function fields(formData: FormData) {
  return {
    title: formData.get('title') ?? '',
    body: formData.get('body') ?? '',
    mood: formData.get('mood') ?? '',
  };
}

export async function createNoteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const parsed = noteSchema.safeParse(fields(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  await repo.createNote(user.id, parsed.data);
  revalidatePath('/notes');
  return { message: 'Saved', tone: 'success' };
}

export async function updateNoteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const parsed = noteUpdateSchema.safeParse({ ...fields(formData), id: formData.get('id') });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const { id, ...input } = parsed.data;
  const updated = await repo.updateNote(user.id, id, input);
  if (!updated) return GONE;

  revalidatePath('/notes');
  return { message: 'Changes saved', tone: 'success' };
}

export async function pinNoteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const pinned = formData.get('pinned') === 'true';

  const done = await repo.setNotePinned(user.id, String(formData.get('id') ?? ''), pinned);
  if (!done) return GONE;

  revalidatePath('/notes');
  return { message: pinned ? 'Pinned' : 'Unpinned', tone: 'success' };
}

export async function deleteNoteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const done = await repo.deleteNote(user.id, String(formData.get('id') ?? ''));
  if (!done) return GONE;

  revalidatePath('/notes');
  return { message: 'Deleted', tone: 'success' };
}
