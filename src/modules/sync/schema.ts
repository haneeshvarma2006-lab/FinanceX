import { bigserial, index, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * The change log: an append-only record of every create, update and delete on
 * a syncable table.
 *
 * Why it exists: an offline client pulls "everything that changed since X". A
 * hard delete leaves nothing behind, so without this the client never learns a
 * row vanished and pushes it back on the next sync — deleted data resurrects.
 *
 * Written by database triggers rather than by the repositories. A repository
 * can forget; a trigger cannot be bypassed by a new code path, and this is
 * exactly the kind of completeness guarantee worth paying for at the database
 * level — the same reasoning as the CHECK constraints elsewhere in the schema.
 */
export const changeLog = pgTable(
  'change_log',
  {
    /**
     * A monotonic sequence, used as the sync cursor.
     *
     * Deliberately not a timestamp: two rows written in the same microsecond
     * tie, and a tie means a client either re-fetches or skips. A sequence is
     * strictly ordered and immune to clock adjustment on the server.
     */
    id: bigserial({ mode: 'bigint' }).primaryKey(),

    /**
     * Intentionally NOT a foreign key.
     *
     * Deleting a user cascades to its rows, and each cascaded delete fires
     * this trigger — writing a log entry for a user that is in the process of
     * disappearing. A FK would make that insert fail and abort the deletion.
     * `hardDeleteUser` purges the log explicitly instead.
     */
    userId: varchar({ length: 36 }).notNull(),

    entityType: varchar({ length: 40 }).notNull(),
    entityId: varchar({ length: 36 }).notNull(),
    /** created | updated | deleted */
    op: varchar({ length: 8 }).notNull(),

    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The only query this table serves: one user's changes after a cursor.
    index('change_log_user_id_idx').on(t.userId, t.id),
  ],
);

export type ChangeLogEntry = typeof changeLog.$inferSelect;
