'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/current-user';
import { fieldErrorsFrom, type FormState } from '@/lib/result';
import * as repo from '@/modules/notes/repository';
import { inkBottom, inkPath } from '@/modules/notes/ink';
import { inkNoteSchema, noteSchema, noteUpdateSchema } from '@/modules/notes/validators';

export type { FormState };

const GONE: FormState = { message: 'That note no longer exists.', tone: 'error' };

/** Notes are written here and on Lifestyle, as the day's diary. */
function revalidateAll() {
  revalidatePath('/notes');
  revalidatePath('/lifestyle');
}

function fields(formData: FormData) {
  return {
    title: formData.get('title') ?? '',
    body: formData.get('body') ?? '',
    mood: formData.get('mood') ?? '',
  };
}

export async function createNoteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const rawInk = formData.get('ink');

  // A handwritten page: the strokes are the entry, the words are optional.
  if (typeof rawInk === 'string' && rawInk !== '') {
    let ink: unknown;
    try {
      ink = JSON.parse(rawInk);
    } catch {
      return { message: 'That page could not be saved. Try again.', tone: 'error' };
    }
    const parsed = inkNoteSchema.safeParse({ ...fields(formData), ink });
    if (!parsed.success) {
      const errors = fieldErrorsFrom(parsed.error.issues);
      return errors.ink
        ? { message: errors.ink, tone: 'error', fieldErrors: errors }
        : { fieldErrors: errors };
    }
    await repo.createNote(user.id, parsed.data);
    revalidateAll();
    return { message: 'Page saved', tone: 'success' };
  }

  const parsed = noteSchema.safeParse(fields(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  await repo.createNote(user.id, parsed.data);
  revalidateAll();
  return { message: 'Saved', tone: 'success' };
}

/** The drawing of one stored page, fetched when it scrolls into view. */
export async function loadInkAction(id: string): Promise<{ path: string; height: number } | null> {
  const user = await requireUser();
  const note = await repo.findNote(user.id, String(id));
  if (!note?.ink) return null;
  return { path: inkPath(note.ink), height: inkBottom(note.ink) };
}

export async function updateNoteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const parsed = noteUpdateSchema.safeParse({ ...fields(formData), id: formData.get('id') });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const { id, ...input } = parsed.data;
  if (input.body === '') {
    // Only a handwritten page may be left without words: the ink is its entry.
    const existing = await repo.findNote(user.id, id);
    if (!existing) return GONE;
    if (!existing.ink) return { fieldErrors: { body: 'Write something first' } };
  }
  const updated = await repo.updateNote(user.id, id, input);
  if (!updated) return GONE;

  revalidateAll();
  return { message: 'Changes saved', tone: 'success' };
}

export async function pinNoteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const pinned = formData.get('pinned') === 'true';

  const done = await repo.setNotePinned(user.id, String(formData.get('id') ?? ''), pinned);
  if (!done) return GONE;

  revalidateAll();
  return { message: pinned ? 'Pinned' : 'Unpinned', tone: 'success' };
}

export async function deleteNoteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const done = await repo.deleteNote(user.id, String(formData.get('id') ?? ''));
  if (!done) return GONE;

  revalidateAll();
  return { message: 'Deleted', tone: 'success' };
}
