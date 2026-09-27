import Link from 'next/link';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Wordmark } from '@/components/ui/wordmark';
import { MobileMenu } from './mobile-menu';
import { ScrollProgress } from './motion';
import { ButtonLink } from './primitives';

const LINKS = [
  { href: '#features', label: 'Product' },
  { href: '#connected', label: 'How it connects' },
  { href: '#analytics', label: 'Analytics' },
] as const;

/**
 * A floating glass bar rather than a full-width strip: it sits over the page
 * like an object, and the page shows through it as you scroll.
 */
export function SiteNav({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <>
      <ScrollProgress />
      <header className="lp-nav-in sticky top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-4">
        <div className="lp-card mx-auto flex h-14 max-w-5xl items-center gap-6 rounded-full pr-2 pl-5 shadow-[var(--shadow-overlay)] backdrop-blur-xl">
          <Link href="/" aria-label="Home" className="rounded-md">
            <Wordmark className="text-base text-brand-ink" />
          </Link>

          <nav aria-label="Sections" className="hidden items-center gap-1 md:flex">
            {LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-full px-3 py-1.5 text-sm text-brand-ink-muted transition-colors duration-[var(--duration-fast)] hover:bg-brand-ink/5 hover:text-brand-ink"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            {/* On a phone the theme switch lives in the menu, so the bar
                holds only the brand, the one call to action and the menu. */}
            <ThemeToggle className="hidden text-brand-ink-muted hover:bg-brand-ink/5 hover:text-brand-ink sm:inline-flex" />
            {signedIn ? (
              <ButtonLink href="/today" className="h-10 px-4">
                Open app
              </ButtonLink>
            ) : (
              <>
                <Link
                  href="/sign-in"
                  className="hidden rounded-full px-3 py-2 text-sm text-brand-ink-muted transition-colors hover:text-brand-ink sm:inline-flex"
                >
                  Sign in
                </Link>
                <ButtonLink href="/sign-up" className="h-10 px-4">
                  Get early access
                </ButtonLink>
              </>
            )}
            <MobileMenu signedIn={signedIn} />
          </div>
        </div>
      </header>
    </>
  );
}
