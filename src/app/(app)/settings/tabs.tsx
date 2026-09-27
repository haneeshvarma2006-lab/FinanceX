'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MotionConfig, motion } from 'framer-motion';
import { cn } from '@/lib/cn';

const TABS = [
  { href: '/settings', label: 'Profile' },
  { href: '/settings/email', label: 'Email' },
  { href: '/settings/security', label: 'Security' },
  { href: '/settings/privacy', label: 'Privacy & data' },
] as const;

/**
 * The settings sections as a segmented control. The selected segment is one
 * ink pill that slides between them; on a phone the control scrolls sideways
 * rather than wrapping onto a second line.
 */
export function SettingsTabs() {
  const pathname = usePathname();

  return (
    <MotionConfig reducedMotion="user">
      <nav
        aria-label="Settings sections"
        className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <ul className="ui-card inline-flex gap-1 rounded-full p-1">
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
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
                      layoutId="settings-tab"
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
