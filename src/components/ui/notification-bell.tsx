import Link from 'next/link';
import { Bell } from 'lucide-react';

/**
 * The unread count is rendered server-side with the layout, so it is correct
 * on first paint rather than arriving after a client fetch.
 */
export function NotificationBell({ count }: { count: number }) {
  const label = count === 0 ? 'Notifications' : `Notifications, ${count} unread`;

  return (
    <Link
      href="/notifications"
      aria-label={label}
      className="relative rounded-[var(--radius-control)] p-2 text-text-secondary transition-colors hover:bg-surface-raised hover:text-text-primary"
    >
      <Bell aria-hidden className="size-4" />
      {count > 0 && (
        <span
          aria-hidden
          className="numeric absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-accent px-1 text-3xs font-medium text-accent-contrast"
        >
          {count > 9 ? '9+' : count}
        </span>
      )}
    </Link>
  );
}
