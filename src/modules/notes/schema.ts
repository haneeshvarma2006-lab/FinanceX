import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';
import { newId } from '@/lib/db/id';
import { users } from '@/modules/identity/schema';
import type { Ink } from './ink';

/**
 * The diary: free writing, owned by one user, editable for ever.
 *
 * Deliberately plain text. Notes are read back exactly as written — no
 * markup is rendered, so nothing a user pastes in can become HTML on the
 * page. The length cap is generous for a day's entry and still keeps one
 * row from growing without bound.
 */
export const notes = pgTable(
  'notes',
  {
    id: varchar({ length: 36 }).primaryKey().$defaultFn(newId),
    userId: varchar({ length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    title: varchar({ length: 160 }),
    /**
     * The words. For a handwritten page this is its transcription, which can
     * be empty until the page has been read — the ink is then the entry.
     */
    body: text().notNull(),
    /** A handwritten page, as pen strokes. See ink.ts. */
    ink: jsonb().$type<Ink>(),
    /** See NOTE_MOODS in validators.ts. Optional: not every entry is about a feeling. */
    mood: varchar({ length: 16 }),
    /** Pinned entries stay at the top, above the days. */
    pinned: boolean().notNull().default(false),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('notes_user_created_idx').on(t.userId, t.createdAt),
    check(
      'notes_body_length',
      sql`char_length(${t.body}) <= 20000 and (char_length(${t.body}) >= 1 or ${t.ink} is not null)`,
    ),
    // A generous ceiling on one page of strokes; the app's own limit is lower.
    check('notes_ink_size', sql`${t.ink} is null or octet_length(${t.ink}::text) <= 1500000`),
    check(
      'notes_mood_check',
      sql`${t.mood} is null or ${t.mood} in ('great','good','okay','low','rough')`,
    ),
  ],
);

export type Note = typeof notes.$inferSelect;
