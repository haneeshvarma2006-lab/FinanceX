import { sql } from 'drizzle-orm';
import { boolean, check, index, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { newId } from '@/lib/db/id';
import { users } from '@/modules/identity/schema';

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
    body: text().notNull(),
    /** See NOTE_MOODS in validators.ts. Optional: not every entry is about a feeling. */
    mood: varchar({ length: 16 }),
    /** Pinned entries stay at the top, above the days. */
    pinned: boolean().notNull().default(false),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('notes_user_created_idx').on(t.userId, t.createdAt),
    check('notes_body_length', sql`char_length(${t.body}) between 1 and 20000`),
    check(
      'notes_mood_check',
      sql`${t.mood} is null or ${t.mood} in ('great','good','okay','low','rough')`,
    ),
  ],
);

export type Note = typeof notes.$inferSelect;
