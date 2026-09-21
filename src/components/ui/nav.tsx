'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

export type NavItem = {
  href: string;
  label: string;
  /** Which domain accent marks this section when active. */
  accent: 'tasks' | 'habits' | 'finance' | 'trading' | 'accent';
  icon: ReactNode;
};

const ACTIVE_ACCENT = {
  tasks: 'text-tasks',
  habits: 'text-habits',
  finance: 'text-finance',
  trading: 'text-trading',
  accent: 'text-accent',
} as const;

/**
 * Primary navigation.
 *
 * One set of links, positioned by CSS rather than rendered twice: a row in the
 * header on a wide screen, a bar at the bottom of the phone where a thumb can
 * reach it. Duplicating the markup would put every destination in the page
 * twice, which is worse for a screen reader than it is for the bundle.
 *
 * The active item is marked by colour AND weight AND aria-current, never by
 * colour alone.
 */
export function MainNav({ items }: { items: readonly NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className={cn(
        // Phone: a fixed bar across the bottom, above the home indicator.
        'fixed inset-x-0 bottom-0 z-40 border-t border-border-subtle',
        'bg-surface-base/90 px-1 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))]',
        'backdrop-blur-xl backdrop-saturate-150',
        // Desktop: an ordinary row inside the header.
        'sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none',
        'sm:-mx-1 sm:min-w-0 sm:overflow-x-auto',
        'sm:[scrollbar-width:none] sm:[&::-webkit-scrollbar]:hidden',
        // Fades the trailing edge so a scrolled-off item reads as "more this
        // way" rather than as a word clipped by a broken layout.
        'sm:[mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)]',
      )}
    >
      <ul className="flex items-stretch justify-between sm:items-center sm:justify-start sm:gap-0.5 sm:px-1">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <li key={item.href} className="min-w-0 flex-1 sm:flex-none">
              <Link
                href={item.href as '/today'}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center gap-0.5 rounded-[var(--radius-control)] px-1 py-1.5',
                  'text-2xs whitespace-nowrap',
                  'transition-colors duration-[var(--duration-fast)] ease-(--ease-out-soft)',
                  'sm:h-8 sm:flex-row sm:gap-0 sm:px-2.5 sm:py-0 sm:text-sm',
                  active
                    ? cn('bg-accent-soft font-medium', ACTIVE_ACCENT[item.accent])
                    : 'text-text-secondary hover:bg-surface-raised hover:text-text-primary',
                )}
              >
                {/* The icon is a phone-sized affordance; the label carries the
                    meaning on both, so nothing depends on recognising a glyph. */}
                <span aria-hidden className="sm:hidden">
                  {item.icon}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
