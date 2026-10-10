import { and, desc, eq, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { containsPattern } from '@/lib/query';
import { notes, type Note } from './schema';
import type { Ink } from './ink';
import type { NoteInput } from './validators';

/** As everywhere: `userId` first, filtered on, no exceptions. */

/** A note as lists show it: everything but the strokes, which load on demand. */
export type NoteSummary = Omit<Note, 'ink'> & { hasInk: boolean };

function searchCondition(search?: string) {
  const term = search?.trim();
  if (!term) return undefined;
  const pattern = containsPattern(term);
  return or(
    sql`${notes.title} ilike ${pattern} escape '\\'`,
    sql`${notes.body} ilike ${pattern} escape '\\'`,
  );
}

export async function listNotes(
  userId: string,
  options: { search?: string; limit?: number } = {},
): Promise<NoteSummary[]> {
  return db
    .select({
      id: notes.id,
      userId: notes.userId,
      title: notes.title,
      body: notes.body,
      mood: notes.mood,
      pinned: notes.pinned,
      createdAt: notes.createdAt,
      updatedAt: notes.updatedAt,
      hasInk: sql<boolean>`${notes.ink} is not null`,
    })
    .from(notes)
    .where(and(eq(notes.userId, userId), searchCondition(options.search)))
    .orderBy(desc(notes.pinned), desc(notes.createdAt))
    .limit(options.limit ?? 200);
}

/** Every note with its strokes, for the account export. */
export async function listNotesForExport(userId: string): Promise<Note[]> {
  return db.select().from(notes).where(eq(notes.userId, userId)).orderBy(desc(notes.createdAt));
}

export async function countNotes(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notes)
    .where(eq(notes.userId, userId));
  return row?.n ?? 0;
}

export async function createNote(
  userId: string,
  input: NoteInput & { ink?: Ink | null },
): Promise<Note> {
  const [row] = await db
    .insert(notes)
    .values({
      userId,
      title: input.title ?? null,
      body: input.body,
      mood: input.mood ?? null,
      ink: input.ink ?? null,
    })
    .returning();
  return row!;
}

export async function findNote(userId: string, id: string): Promise<Note | undefined> {
  const [row] = await db
    .select()
    .from(notes)
    .where(and(eq(notes.id, id), eq(notes.userId, userId)))
    .limit(1);
  return row;
}

/** Returns undefined when the note does not exist or belongs to someone else. */
export async function updateNote(
  userId: string,
  id: string,
  input: NoteInput,
): Promise<Note | undefined> {
  const [row] = await db
    .update(notes)
    .set({
      title: input.title ?? null,
      body: input.body,
      mood: input.mood ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(notes.id, id), eq(notes.userId, userId)))
    .returning();
  return row;
}

/** Pinning is not an edit, so it leaves `updatedAt` alone. */
export async function setNotePinned(userId: string, id: string, pinned: boolean): Promise<boolean> {
  const rows = await db
    .update(notes)
    .set({ pinned })
    .where(and(eq(notes.id, id), eq(notes.userId, userId)))
    .returning({ id: notes.id });
  return rows.length > 0;
}

export async function deleteNote(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(notes)
    .where(and(eq(notes.id, id), eq(notes.userId, userId)))
    .returning({ id: notes.id });
  return rows.length > 0;
}
