import * as repo from './repository';

/**
 * In-app notifications.
 *
 * Distinct from email on purpose: these need no provider, so they are the
 * channel that actually works in this build. Every kind is user-switchable,
 * and every raise is deduplicated.
 */

export const NOTIFICATION_KINDS = {
  task_overdue: {
    label: 'Overdue tasks',
    description: 'When something you scheduled has passed its due time.',
  },
  habit_streak_risk: {
    label: 'Streak at risk',
    description: 'When a habit streak is about to break.',
  },
  goal_achieved: {
    label: 'Goal reached',
    description: 'When you hit a target you set.',
  },
  goal_off_track: {
    label: 'Goal falling behind',
    description: 'When a goal needs a faster pace to finish on time.',
  },
  budget_exceeded: {
    label: 'Budget exceeded',
    description: 'When spending in a category passes the budget you set.',
  },
  trading_review_due: {
    label: 'Trading review due',
    description: 'After a run of losing trades, as a prompt to review rather than continue.',
  },
} as const;

export type NotificationKind = keyof typeof NOTIFICATION_KINDS;

export const NOTIFICATION_KIND_KEYS = Object.keys(NOTIFICATION_KINDS) as NotificationKind[];

export function isNotificationKind(value: string): value is NotificationKind {
  return value in NOTIFICATION_KINDS;
}

/**
 * Only same-origin paths are stored as notification targets. A notification is
 * a link the user is invited to click, so an absolute URL here would be an
 * open redirect with the product's own credibility behind it.
 */
function safeHref(href: string | undefined): string | null {
  if (!href) return null;
  const cleaned = href.replace(/[\t\n\r\0]/g, '');
  if (!cleaned.startsWith('/') || cleaned.startsWith('//')) return null;
  if (cleaned.includes('\\')) return null;
  if (/^\/+[a-z][a-z0-9+.-]*:/i.test(cleaned)) return null;
  return cleaned;
}

export type NotifyInput = {
  kind: NotificationKind;
  title: string;
  body?: string;
  href?: string;
  entityType?: string;
  entityId?: string;
  /** Without one, the same condition raises a new row every evaluation. */
  dedupeKey?: string;
};

/**
 * Raise a notification, honouring the user's preference for its kind.
 *
 * Returns whether a row was actually created — false means it was suppressed
 * by preference or by deduplication, both of which are normal.
 */
export async function notify(userId: string, input: NotifyInput): Promise<boolean> {
  if (!(await repo.isNotificationKindEnabled(userId, input.kind))) return false;

  return repo.insertNotification({
    userId,
    kind: input.kind,
    title: input.title.slice(0, 200),
    body: input.body?.slice(0, 1000) ?? null,
    href: safeHref(input.href),
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    dedupeKey: input.dedupeKey ?? null,
  });
}

/** Defaults for a new account: everything on, since all of it is user-initiated. */
export async function seedNotificationPreferences(userId: string): Promise<void> {
  for (const kind of NOTIFICATION_KIND_KEYS) {
    await repo.setNotificationPreference(userId, kind, true);
  }
}
