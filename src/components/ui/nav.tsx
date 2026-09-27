'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MotionConfig, motion } from 'framer-motion';
import { cn } from '@/lib/cn';

export type NavItem = {
  href: string;
  label: string;
  /** Which domain accent marks this section when active. */
  accent: 'tasks' | 'habits' | 'finance' | 'trading' | 'accent';
  icon: ReactNode;
};

/** The active section wears its own domain colour; Today and Rules wear ink. */
const ACTIVE_TEXT = {
  tasks: 'text-tasks',
  habits: 'text-habits',
  finance: 'text-finance',
  trading: 'text-trading',
  accent: 'text-accent',
} as const;

const ACTIVE_PILL = {
  tasks: 'bg-tasks/12 sm:ring-tasks/25',
  habits: 'bg-habits/12 sm:ring-habits/25',
  finance: 'bg-finance/12 sm:ring-finance/25',
  trading: 'bg-trading/12 sm:ring-trading/25',
  accent: 'bg-accent-soft sm:ring-accent/20',
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
 * colour alone. Its pill is one shared element that glides from the old
 * section to the new one on navigation, taking on the new section's colour
 * as it goes.
 */
export function MainNav({ items }: { items: readonly NavItem[] }) {
  const pathname = usePathname();

  return (
    <MotionConfig reducedMotion="user">
      <nav
        aria-label="Main"
        className={cn(
          // Phone: a fixed bar across the bottom, above the home indicator.
          'fixed inset-x-0 bottom-0 z-40 border-t border-border-subtle',
          'bg-surface-sunken/85 px-1 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))]',
          'shadow-(--shadow-edge)',
          'backdrop-blur-xl backdrop-saturate-150',
          // Desktop: an ordinary row inside the header.
          'sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none sm:backdrop-blur-none',
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
                    'relative isolate flex flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 sm:rounded-full',
                    'text-2xs whitespace-nowrap',
                    'transition-colors duration-[var(--duration-fast)] ease-(--ease-out-soft)',
                    'sm:h-8 sm:flex-row sm:gap-0 sm:px-3 sm:py-0 sm:text-sm',
                    active
                      ? cn('font-medium', ACTIVE_TEXT[item.accent])
                      : 'text-text-secondary hover:bg-surface-raised hover:text-text-primary',
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="main-nav-pill"
                      aria-hidden
                      className={cn(
                        'absolute inset-0 -z-10 rounded-xl sm:rounded-full sm:ring-1 sm:ring-inset',
                        ACTIVE_PILL[item.accent],
                      )}
                      transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                    />
                  )}
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
    </MotionConfig>
  );
}
