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
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const activeIndex = items.findIndex((item) => isActive(item.href));

  return (
    <MotionConfig reducedMotion="user">
      <nav
        aria-label="Main"
        data-vt-anchor="dock"
        className={cn(
          // Phone: a floating glass dock, inset from the edges and lifted
          // clear of the home indicator.
          'fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 rounded-3xl p-1.5',
          'shadow-(--shadow-sheet) backdrop-blur-2xl backdrop-saturate-150 max-sm:ui-card',
          // Desktop: an ordinary row inside the header.
          'sm:static sm:rounded-none sm:p-0 sm:shadow-none sm:backdrop-blur-none',
          'sm:-mx-1 sm:min-w-0 sm:overflow-x-auto',
          'sm:[scrollbar-width:none] sm:[&::-webkit-scrollbar]:hidden',
          // Fades the trailing edge so a scrolled-off item reads as "more this
          // way" rather than as a word clipped by a broken layout.
          'sm:[mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)]',
        )}
      >
        <ul className="flex items-stretch justify-between sm:items-center sm:justify-start sm:gap-0.5 sm:px-1">
          {items.map((item, index) => {
            const active = index === activeIndex;

            return (
              <li key={item.href} className="min-w-0 flex-1 sm:flex-none">
                <Link
                  href={item.href as '/today'}
                  aria-current={active ? 'page' : undefined}
                  // The screen slides the way the tab row reads: a tab to the
                  // right arrives from the right, one to the left from the left.
                  transitionTypes={[index < activeIndex ? 'nav-back' : 'nav-forward']}
                  className={cn(
                    'relative isolate flex flex-col items-center gap-1 rounded-2xl px-1 py-2 sm:rounded-full',
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
                        'absolute inset-0 -z-10 rounded-2xl sm:rounded-full sm:ring-1 sm:ring-inset',
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
