import { and, desc, eq, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { containsPattern } from '@/lib/query';
import { notes, type Note } from './schema';
import type { NoteInput } from './validators';

/** As everywhere: `userId` first, filtered on, no exceptions. */

export async function listNotes(
  userId: string,
  options: { search?: string; limit?: number } = {},
): Promise<Note[]> {
  const term = options.search?.trim();
  const pattern = term ? containsPattern(term) : undefined;

  return db
    .select()
    .from(notes)
    .where(
      and(
        eq(notes.userId, userId),
        pattern
          ? or(
              sql`${notes.title} ilike ${pattern} escape '\\'`,
              sql`${notes.body} ilike ${pattern} escape '\\'`,
            )
          : undefined,
      ),
    )
    .orderBy(desc(notes.pinned), desc(notes.createdAt))
    .limit(options.limit ?? 200);
}

export async function countNotes(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notes)
    .where(eq(notes.userId, userId));
  return row?.n ?? 0;
}

export async function createNote(userId: string, input: NoteInput): Promise<Note> {
  const [row] = await db
    .insert(notes)
    .values({
      userId,
      title: input.title ?? null,
      body: input.body,
      mood: input.mood ?? null,
    })
    .returning();
  return row!;
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
