import Link from 'next/link';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Wordmark } from '@/components/ui/wordmark';
import { ScrollProgress } from './motion';
import { ButtonLink, Container } from './primitives';

const LINKS = [
  { href: '#features', label: 'Product' },
  { href: '#connected', label: 'How it connects' },
  { href: '#analytics', label: 'Analytics' },
] as const;

export function SiteNav({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <header className="sticky top-0 z-50 border-b border-brand-line/60 bg-brand-canvas/70 backdrop-blur-xl">
      <Container className="flex h-16 items-center gap-8">
        <Link href="/" aria-label="Home" className="rounded-md">
          <Wordmark className="text-base text-brand-ink" />
        </Link>

        <nav aria-label="Sections" className="hidden items-center gap-6 md:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-brand-ink-muted transition-colors duration-[var(--duration-fast)] hover:text-brand-ink"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle className="text-brand-ink-muted hover:bg-brand-card hover:text-brand-ink" />
          {signedIn ? (
            <ButtonLink href="/today" className="h-9 px-4">
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
              <ButtonLink href="/sign-up" className="h-9 px-4">
                Get early access
              </ButtonLink>
            </>
          )}
        </div>
      </Container>
      <ScrollProgress />
    </header>
  );
}
