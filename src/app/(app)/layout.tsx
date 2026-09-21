import Link from 'next/link';
import { CheckSquare, Flame, LayoutGrid, LineChart, Target, Wallet, Workflow } from 'lucide-react';
import { cn } from '@/lib/cn';
import { requireUser } from '@/lib/auth/current-user';
import { countUnreadNotifications } from '@/modules/productivity/repository';
import { NotificationBell } from '@/components/ui/notification-bell';
import { MainNav, type NavItem } from '@/components/ui/nav';
import { signOutAction } from '../(auth)/actions';

const ICON = 'size-4';

const NAV: readonly NavItem[] = [
  { href: '/today', label: 'Today', accent: 'accent', icon: <LayoutGrid className={ICON} /> },
  { href: '/tasks', label: 'Tasks', accent: 'tasks', icon: <CheckSquare className={ICON} /> },
  { href: '/habits', label: 'Habits', accent: 'habits', icon: <Flame className={ICON} /> },
  { href: '/goals', label: 'Goals', accent: 'habits', icon: <Target className={ICON} /> },
  { href: '/finance', label: 'Finance', accent: 'finance', icon: <Wallet className={ICON} /> },
  { href: '/trading', label: 'Trading', accent: 'trading', icon: <LineChart className={ICON} /> },
  { href: '/rules', label: 'Rules', accent: 'accent', icon: <Workflow className={ICON} /> },
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

      <header
        className={cn(
          'chrome sticky top-0 z-40 border-b border-border-subtle bg-surface-base',
          // The blur starts at sm on purpose. A backdrop-filter makes an
          // element the containing block for its `position: fixed`
          // descendants, which on a phone would pin the bottom nav to the
          // bottom of this header instead of the viewport.
          'sm:bg-surface-base/80 sm:backdrop-blur-xl sm:backdrop-saturate-150',
        )}
      >
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link
            href="/today"
            className="shrink-0 rounded-[var(--radius-control)] text-sm font-semibold tracking-tight text-text-primary"
          >
            Kyli<span className="text-accent">X</span>
          </Link>

          <span aria-hidden className="hidden h-4 w-px shrink-0 bg-border-subtle sm:block" />

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

      <main
        id="main"
        className="enter mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-24 sm:px-6 sm:pt-8 sm:pb-10"
      >
        {children}
      </main>
    </div>
  );
}
