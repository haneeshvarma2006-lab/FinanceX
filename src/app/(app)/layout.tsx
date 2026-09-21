import Link from 'next/link';
import { requireUser } from '@/lib/auth/current-user';
import { countUnreadNotifications } from '@/modules/productivity/repository';
import { NotificationBell } from '@/components/ui/notification-bell';
import { MainNav, type NavItem } from '@/components/ui/nav';
import { signOutAction } from '../(auth)/actions';

const NAV: readonly NavItem[] = [
  { href: '/today', label: 'Today', accent: 'accent' },
  { href: '/tasks', label: 'Tasks', accent: 'tasks' },
  { href: '/habits', label: 'Habits', accent: 'habits' },
  { href: '/goals', label: 'Goals', accent: 'habits' },
  { href: '/finance', label: 'Finance', accent: 'finance' },
  { href: '/trading', label: 'Trading', accent: 'trading' },
  { href: '/rules', label: 'Rules', accent: 'accent' },
] as const;

/**
 * Every route inside this group is authenticated by this one call. A page that
 * forgets to check is still protected, because the layout runs first.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const unread = await countUnreadNotifications(user.id);

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-[var(--radius-control)] focus:bg-surface-overlay focus:px-3 focus:py-2 focus:text-sm focus:shadow-(--shadow-overlay)"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-border-subtle bg-surface-base/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link
            href="/today"
            className="shrink-0 text-sm font-semibold tracking-tight text-text-primary"
          >
            Kyli<span className="text-accent">X</span>
          </Link>

          <MainNav items={NAV} />

          <div className="ml-auto flex shrink-0 items-center gap-1">
            <NotificationBell count={unread} />

            <Link
              href="/settings"
              className="inline-flex h-8 items-center rounded-[var(--radius-control)] px-2.5 text-sm text-text-secondary transition-colors duration-[var(--duration-fast)] hover:bg-surface-raised hover:text-text-primary"
            >
              Settings
            </Link>

            <span aria-hidden className="mx-1 hidden h-4 w-px bg-border-subtle sm:block" />

            <span className="hidden max-w-32 truncate text-sm text-text-secondary sm:inline">
              {user.displayName}
            </span>

            <form action={signOutAction}>
              <button
                type="submit"
                className="inline-flex h-8 items-center rounded-[var(--radius-control)] px-2.5 text-sm text-text-secondary transition-colors duration-[var(--duration-fast)] hover:bg-surface-raised hover:text-text-primary"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}
