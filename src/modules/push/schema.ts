import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { newId } from '@/lib/db/id';
import { users } from '@/modules/identity/schema';

/**
 * One phone or browser that has agreed to receive push notifications.
 *
 * The endpoint is the push service's address for that one device; the two
 * keys encrypt what is sent to it, so the push service (Google, Mozilla,
 * Apple, Microsoft) carries the message without being able to read it. An
 * endpoint belongs to one account at a time: signing in as someone else on
 * the same phone moves it.
 */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: varchar({ length: 36 }).primaryKey().$defaultFn(newId),
    userId: varchar({ length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text().notNull(),
    p256dh: varchar({ length: 200 }).notNull(),
    auth: varchar({ length: 100 }).notNull(),
    /** "Chrome on Android": how the device is named in settings. */
    label: varchar({ length: 80 }),
    /** Failed deliveries in a row; the subscription is dropped after a few. */
    failures: integer().notNull().default(0),
    lastSentAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('push_subscriptions_endpoint_key').on(t.endpoint),
    index('push_subscriptions_user_idx').on(t.userId),
  ],
);

export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
