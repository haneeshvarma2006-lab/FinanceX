'use client';

import { useRef } from 'react';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/cn';
import { THEME_COOKIE, type Theme } from '@/lib/theme';

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * The Black / White switch.
 *
 * Both icons are always rendered and the active one is chosen by CSS from
 * `data-theme`, so the button is right on the server's first paint with no
 * state to hydrate. Where the browser has view transitions, the new theme
 * spreads out from the button as a circle; everywhere else, and for anyone
 * who prefers reduced motion, it simply switches.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const ref = useRef<HTMLButtonElement>(null);

  function toggle() {
    const root = document.documentElement;
    const next: Theme = root.dataset.theme === 'light' ? 'dark' : 'light';

    const apply = () => {
      if (next === 'light') root.dataset.theme = 'light';
      else delete root.dataset.theme;
      const secure = location.protocol === 'https:' ? '; Secure' : '';
      document.cookie = `${THEME_COOKIE}=${next}; Path=/; Max-Age=${ONE_YEAR}; SameSite=Lax${secure}`;
    };

    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof document.startViewTransition !== 'function') {
      apply();
      return;
    }

    const rect = ref.current?.getBoundingClientRect();
    const x = rect ? rect.left + rect.width / 2 : innerWidth / 2;
    const y = rect ? rect.top + rect.height / 2 : 0;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));

    const transition = document.startViewTransition(apply);
    void transition.ready.then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        {
          duration: 600,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          pseudoElement: '::view-transition-new(root)',
        },
      );
    });
  }

  return (
    <button
      ref={ref}
      type="button"
      onClick={toggle}
      aria-label="Switch between the Black and White themes"
      title="Switch theme"
      className={cn(
        'relative inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full',
        'text-text-secondary transition-colors duration-[var(--duration-fast)]',
        'hover:bg-surface-raised hover:text-text-primary',
        className,
      )}
    >
      <Moon
        aria-hidden
        className={cn(
          'theme-icon absolute size-4',
          'light:translate-y-6 light:rotate-90 light:opacity-0',
        )}
      />
      <Sun
        aria-hidden
        className={cn(
          'theme-icon absolute size-4 -translate-y-6 -rotate-90 opacity-0',
          'light:translate-y-0 light:rotate-0 light:opacity-100',
        )}
      />
    </button>
  );
}
