import Link from 'next/link';
import { brand } from '@/lib/brand';
import { Wordmark } from '@/components/ui/wordmark';
import { Container } from './primitives';

const COLUMNS = [
  {
    title: 'Product',
    links: [
      { href: '#features', label: 'Features' },
      { href: '#connected', label: 'How it connects' },
      { href: '#analytics', label: 'Analytics' },
    ],
  },
  {
    title: 'Account',
    links: [
      { href: '/sign-up', label: 'Get early access' },
      { href: '/sign-in', label: 'Sign in' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '/legal/terms', label: 'Terms' },
      { href: '/legal/privacy', label: 'Privacy' },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-brand-line/60">
      <Container className="flex flex-col gap-12 py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          <div className="flex flex-col gap-3 lg:col-span-2">
            <Wordmark className="text-base text-brand-ink" />
            <p className="max-w-xs text-sm text-brand-ink-muted">{brand.tagline}</p>
          </div>
          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title} className="flex flex-col gap-3">
              <p className="text-xs font-medium text-brand-ink">{column.title}</p>
              {column.links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href as '/'}
                  className="text-sm text-brand-ink-muted transition-colors hover:text-brand-ink"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          ))}
        </div>

        <div className="flex flex-col gap-3 border-t border-brand-line/60 pt-6 text-xs text-brand-ink-subtle sm:flex-row sm:items-start sm:justify-between">
          <p>
            © {new Date().getFullYear()} {brand.name}
          </p>
          <p className="max-w-xl sm:text-right">
            {brand.name} records what you enter. It does not place trades, connect to a broker, or
            give financial advice, and past results say nothing about future ones.
          </p>
        </div>
      </Container>
    </footer>
  );
}
