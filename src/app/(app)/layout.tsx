import Link from 'next/link';

const NAV = [
  { href: '/today', label: 'Today' },
  { href: '/finance', label: 'Finance' },
  { href: '/trading', label: 'Trading' },
  { href: '/settings', label: 'Settings' },
] as const;
import { requireUser } from '@/lib/auth/current-user';
import { signOutAction } from '../(auth)/actions';

/**
 * Every route inside this group is authenticated by this one call. A page that
 * forgets to check is still protected, because the layout runs first.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded focus:bg-surface-overlay focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-border-subtle bg-surface-base/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
          <div className="flex min-w-0 items-center gap-5">
            <Link href="/today" className="text-sm font-semibold tracking-tight">
              Kyli<span className="text-accent">X</span>
            </Link>

            <nav aria-label="Main">
              <ul className="flex items-center gap-1">
                {NAV.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="rounded-[var(--radius-control)] px-2.5 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-raised hover:text-text-primary"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-text-secondary sm:inline">{user.displayName}</span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded-[var(--radius-control)] px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-raised hover:text-text-primary"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {children}
      </main>
    </div>
  );
}
