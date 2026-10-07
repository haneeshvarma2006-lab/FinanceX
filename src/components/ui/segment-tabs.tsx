'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MotionConfig, motion } from 'framer-motion';
import { cn } from '@/lib/cn';

export type SegmentTab = { href: string; label: string };

/**
 * Sections of one screen as a segmented control. The selected segment is one
 * ink pill that slides between them; on a phone the control scrolls sideways
 * rather than wrapping onto a second line.
 */
export function SegmentTabs({
  tabs,
  label,
  pillId,
}: {
  tabs: readonly SegmentTab[];
  /** Names the navigation landmark for screen readers. */
  label: string;
  /** Unique per control, so two controls never trade pills. */
  pillId: string;
}) {
  const pathname = usePathname();

  return (
    <MotionConfig reducedMotion="user">
      <nav
        aria-label={label}
        className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <ul className="ui-card inline-flex gap-1 rounded-full p-1">
          {tabs.map((tab) => {
            const active = pathname === tab.href;
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href as '/'}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative isolate inline-flex h-9 items-center rounded-full px-4 text-sm whitespace-nowrap',
                    'transition-colors duration-[var(--duration-fast)]',
                    active
                      ? 'font-medium text-surface-sunken'
                      : 'text-text-secondary hover:text-text-primary',
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId={pillId}
                      aria-hidden
                      className="absolute inset-0 -z-10 rounded-full bg-text-primary"
                      transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                    />
                  )}
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </MotionConfig>
  );
}
