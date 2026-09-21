'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

export type NavItem = {
  href: string;
  label: string;
  /** Which domain accent marks this section when active. */
  accent: 'tasks' | 'habits' | 'finance' | 'trading' | 'accent';
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
 * The active item is marked by colour AND weight, never colour alone. On
 * narrow screens the row scrolls horizontally rather than wrapping into a
 * second line that pushes the content down — a header that changes height as
 * you navigate is disorienting.
 */
export function MainNav({ items }: { items: readonly NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className={cn(
        '-mx-1 min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        // Fades the trailing edge so a scrolled-off item reads as "more this
        // way" rather than as a word clipped by a broken layout.
        '[mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)]',
      )}
    >
      <ul className="flex items-center gap-0.5 px-1">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <li key={item.href}>
              <Link
                href={item.href as '/today'}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex h-8 items-center rounded-[var(--radius-control)] px-2.5',
                  'text-sm whitespace-nowrap transition-colors duration-[var(--duration-fast)]',
                  'ease-(--ease-out-soft)',
                  active
                    ? cn('bg-accent-soft font-medium', ACTIVE_ACCENT[item.accent])
                    : 'text-text-secondary hover:bg-surface-raised hover:text-text-primary',
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
