'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { Ellipsis, X } from 'lucide-react';
import { cn } from '@/lib/cn';

export type NavItem = {
  href: string;
  label: string;
  /** Which domain accent marks this section when active. */
  accent: 'tasks' | 'goals' | 'habits' | 'finance' | 'trading' | 'accent';
  icon: ReactNode;
  /** Kept in the phone dock; everything else lives behind "More". */
  primary?: boolean;
};

/** The active section wears its own domain colour; Today and Rules wear ink. */
const ACTIVE_TEXT = {
  tasks: 'text-tasks',
  goals: 'text-warning',
  habits: 'text-habits',
  finance: 'text-finance',
  trading: 'text-trading',
  accent: 'text-accent',
} as const;

const ACTIVE_PILL = {
  tasks: 'bg-tasks/12 sm:ring-tasks/25',
  goals: 'bg-warning/12 sm:ring-warning/25',
  habits: 'bg-habits/12 sm:ring-habits/25',
  finance: 'bg-finance/12 sm:ring-finance/25',
  trading: 'bg-trading/12 sm:ring-trading/25',
  accent: 'bg-accent-soft sm:ring-accent/20',
} as const;

const TILE = {
  tasks: 'bg-tasks/14 text-tasks ring-tasks/30',
  goals: 'bg-warning/14 text-warning ring-warning/30',
  habits: 'bg-habits/14 text-habits ring-habits/30',
  finance: 'bg-finance/14 text-finance ring-finance/30',
  trading: 'bg-trading/14 text-trading ring-trading/30',
  accent: 'bg-surface-overlay text-text-primary ring-border-strong',
} as const;

/**
 * Primary navigation.
 *
 * One set of links, positioned by CSS rather than rendered twice: a row in the
 * header on a wide screen, a dock at the bottom of the phone where a thumb can
 * reach it. The dock keeps only the primary sections — eight labels in one
 * row are too small to read or to hit — and a "More" button opens a sheet
 * with the rest, each in its own colour.
 *
 * The active item is marked by colour AND weight AND aria-current, never by
 * colour alone. Its pill is one shared element that glides from the old
 * section to the new one on navigation.
 */
export function MainNav({ items }: { items: readonly NavItem[] }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const activeIndex = items.findIndex((item) => isActive(item.href));
  const activeIsSecondary = activeIndex >= 0 && !items[activeIndex]!.primary;
  const [sheet, setSheet] = useState(false);

  // Navigating closes the sheet: adjusted during render, not in an effect.
  const [seenPath, setSeenPath] = useState(pathname);
  if (pathname !== seenPath) {
    setSeenPath(pathname);
    setSheet(false);
  }

  useEffect(() => {
    if (!sheet) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSheet(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sheet]);

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
              <li
                key={item.href}
                className={cn('min-w-0 flex-1 sm:flex-none', !item.primary && 'max-sm:hidden')}
              >
                <Link
                  href={item.href as '/today'}
                  aria-current={active ? 'page' : undefined}
                  // The screen slides the way the tab row reads: a tab to the
                  // right arrives from the right, one to the left from the left.
                  transitionTypes={[index < activeIndex ? 'nav-back' : 'nav-forward']}
                  className={cn(
                    'relative isolate flex flex-col items-center gap-1 rounded-2xl px-1 py-2 sm:rounded-full',
                    'text-xs whitespace-nowrap sm:text-sm',
                    'transition-colors duration-[var(--duration-fast)] ease-(--ease-out-soft)',
                    'sm:h-8 sm:flex-row sm:gap-0 sm:px-3 sm:py-0',
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
                  <span aria-hidden className="sm:hidden [&>svg]:size-5">
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              </li>
            );
          })}
          <li className="min-w-0 flex-1 sm:hidden">
            <button
              type="button"
              aria-expanded={sheet}
              onClick={() => setSheet(true)}
              className={cn(
                'relative isolate flex w-full flex-col items-center gap-1 rounded-2xl px-1 py-2 text-xs',
                activeIsSecondary || sheet
                  ? cn('font-medium', ACTIVE_TEXT[items[activeIndex]?.accent ?? 'accent'])
                  : 'text-text-secondary',
              )}
            >
              {activeIsSecondary && (
                <motion.span
                  layoutId="main-nav-pill"
                  aria-hidden
                  className={cn(
                    'absolute inset-0 -z-10 rounded-2xl',
                    ACTIVE_PILL[items[activeIndex]!.accent],
                  )}
                  transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                />
              )}
              <Ellipsis aria-hidden className="size-5" />
              {activeIsSecondary ? items[activeIndex]!.label : 'More'}
            </button>
          </li>
        </ul>
      </nav>

      <AnimatePresence>
        {sheet && (
          <div className="fixed inset-0 z-50 sm:hidden">
            <motion.button
              type="button"
              aria-label="Close menu"
              onClick={() => setSheet(false)}
              className="absolute inset-0 bg-black/55 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="All sections"
              className="absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] rounded-3xl p-4 shadow-(--shadow-sheet) ui-card backdrop-blur-2xl"
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 36 }}
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-text-primary">All sections</p>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setSheet(false)}
                  className="inline-flex size-8 items-center justify-center rounded-full text-text-secondary hover:bg-surface-overlay"
                >
                  <X aria-hidden className="size-4" />
                </button>
              </div>
              <ul className="grid grid-cols-3 gap-2">
                {items.map((item, index) => (
                  <li key={item.href}>
                    <Link
                      href={item.href as '/today'}
                      aria-current={index === activeIndex ? 'page' : undefined}
                      className={cn(
                        'flex flex-col items-center gap-2 rounded-2xl border px-2 py-3 text-xs font-medium',
                        index === activeIndex
                          ? 'border-border-strong bg-surface-overlay text-text-primary'
                          : 'border-border-subtle/70 text-text-secondary',
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'inline-flex size-10 items-center justify-center rounded-xl ring-1 ring-inset [&>svg]:size-5',
                          TILE[item.accent],
                        )}
                      >
                        {item.icon}
                      </span>
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
