import Link from 'next/link';
import {
  CheckSquare,
  Flame,
  LayoutGrid,
  LineChart,
  LogOut,
  Target,
  Wallet,
  Workflow,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { requireUser } from '@/lib/auth/current-user';
import { countUnreadNotifications } from '@/modules/productivity/repository';
import { NotificationBell } from '@/components/ui/notification-bell';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { MainNav, type NavItem } from '@/components/ui/nav';
import { signOutAction } from '../(auth)/actions';
import { Wordmark } from '@/components/ui/wordmark';

const ICON = 'size-4';

const NAV: readonly NavItem[] = [
  { href: '/today', label: 'Today', accent: 'accent', icon: <LayoutGrid className={ICON} /> },
  { href: '/tasks', label: 'Tasks', accent: 'tasks', icon: <CheckSquare className={ICON} /> },
  { href: '/lifestyle', label: 'Lifestyle', accent: 'habits', icon: <Flame className={ICON} /> },
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
    <div className="relative isolate flex min-h-dvh flex-col">
      {/* The landing page's light, turned down for daily use: one soft
          horizon above the work, and the same fine grain over the page. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-160 overflow-hidden opacity-70"
      >
        <div className="lp-horizon lp-breathe absolute inset-0" />
      </div>
      <div aria-hidden className="lp-noise" />

      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-[var(--radius-control)] focus:bg-surface-overlay focus:px-3 focus:py-2 focus:text-sm focus:shadow-(--shadow-overlay)"
      >
        Skip to content
      </a>

      <header
        className={cn(
          'chrome sticky top-0 z-40 border-b border-border-subtle/70',
          // From sm up the bar floats: a glass pill over the page. The blur
          // lives on the pill and starts at sm on purpose — a backdrop-filter
          // makes an element the containing block for its `position: fixed`
          // descendants, which on a phone would pin the bottom nav to the
          // bottom of this header instead of the viewport.
          'sm:border-0 sm:bg-transparent sm:px-4 sm:pt-3 sm:shadow-none',
        )}
      >
        {/* Phone glass. The blur sits on this separate layer rather than on
            the header, so the header never becomes the containing block of
            the fixed bottom dock inside it. */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-surface-sunken/75 backdrop-blur-xl backdrop-saturate-150 sm:hidden"
        />
        <div className="mx-auto flex h-15 max-w-6xl items-center gap-3 px-4 sm:h-14 sm:rounded-full sm:pr-2 sm:pl-5 sm:shadow-(--shadow-overlay) sm:ui-card sm:backdrop-blur-xl sm:backdrop-saturate-150">
          <Link
            href="/today"
            className="shrink-0 rounded-[var(--radius-control)] text-text-primary"
          >
            <Wordmark className="text-sm" />
          </Link>

          <span aria-hidden className="hidden h-4 w-px shrink-0 bg-border-subtle sm:block" />

          <MainNav items={NAV} />

          <div className="ml-auto flex shrink-0 items-center gap-1">
            <ThemeToggle />
            <NotificationBell count={unread} />

            {/* One link at every width: the avatar on a phone, the word from
                sm up. The label keeps its name the same for assistive tech. */}
            <Link
              href="/settings"
              aria-label="Settings"
              className="inline-flex h-8 items-center rounded-full text-sm text-text-secondary transition-colors duration-[var(--duration-fast)] hover:bg-surface-raised hover:text-text-primary sm:px-3"
            >
              <span
                aria-hidden
                className="inline-flex size-8 items-center justify-center rounded-full bg-linear-to-br from-tasks via-trading to-finance text-xs font-semibold text-surface-sunken ring-2 ring-surface-sunken sm:hidden"
              >
                {initial(user.displayName)}
              </span>
              <span className="hidden sm:inline">Settings</span>
            </Link>

            <span aria-hidden className="mx-1 hidden h-4 w-px bg-border-subtle sm:block" />

            <span className="hidden items-center gap-2 sm:inline-flex">
              <span
                aria-hidden
                className="inline-flex size-7 items-center justify-center rounded-full bg-linear-to-br from-tasks via-trading to-finance text-xs font-semibold text-surface-sunken"
              >
                {initial(user.displayName)}
              </span>
              <span className="max-w-32 truncate text-sm text-text-secondary">
                {user.displayName}
              </span>
            </span>

            <form action={signOutAction}>
              <button
                type="submit"
                aria-label="Sign out"
                className="inline-flex size-8 items-center justify-center rounded-full text-sm text-text-secondary transition-colors duration-[var(--duration-fast)] hover:bg-surface-raised hover:text-text-primary sm:w-auto sm:px-3"
              >
                <LogOut aria-hidden className="size-4 sm:hidden" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      <main
        id="main"
        className="cascade mx-auto w-full max-w-6xl flex-1 px-4 pt-8 pb-36 sm:px-6 sm:pt-12 sm:pb-16"
      >
        {children}
      </main>
    </div>
  );
}

/** The first letter of the display name, for the avatar. Never empty. */
function initial(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase();
}
