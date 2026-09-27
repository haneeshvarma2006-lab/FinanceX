'use client';

import { Children, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * A group of cards that becomes a swipeable rail on a phone and a grid from
 * `md` up. The next card peeks in from the edge so the gesture is obvious,
 * cards snap into place, and dots under the rail say where you are.
 *
 * One tree at every width — the grid is the same element with different
 * classes — so nothing is rendered twice and nothing mismatches on hydrate.
 */
export function Rail({
  children,
  label,
  gridClassName,
}: {
  children: ReactNode;
  /** Names the group for assistive tech; the dots are decoration. */
  label: string;
  /** Grid layout from `md` up, e.g. `md:grid-cols-2 lg:grid-cols-4`. */
  gridClassName: string;
}) {
  const items = Children.toArray(children);
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      const first = el.firstElementChild as HTMLElement | null;
      if (!first) return;
      const step = first.offsetWidth + 12;
      setActive(Math.min(items.length - 1, Math.round(el.scrollLeft / step)));
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [items.length]);

  return (
    <div>
      <div
        ref={ref}
        role="group"
        aria-label={label}
        className={cn(
          // Phone: a snapping rail that bleeds to the screen edges.
          '-mx-5 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 pb-1',
          '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          // md and up: an ordinary grid.
          'md:mx-0 md:grid md:gap-4 md:overflow-visible md:px-0 md:pb-0',
          gridClassName,
        )}
      >
        {items.map((item, i) => (
          <div key={i} className="w-[84%] shrink-0 snap-start md:w-auto">
            {item}
          </div>
        ))}
      </div>

      <div aria-hidden className="mt-5 flex justify-center gap-1.5 md:hidden">
        {items.map((_, i) => (
          <span
            key={i}
            className={cn(
              'h-1.5 rounded-full transition-all duration-[var(--duration-base)] ease-(--ease-out-soft)',
              i === active ? 'w-5 bg-brand-ink' : 'w-1.5 bg-brand-ink/25',
            )}
          />
        ))}
      </div>
    </div>
  );
}
