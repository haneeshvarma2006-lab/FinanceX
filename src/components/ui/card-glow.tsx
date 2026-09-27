'use client';

import { useEffect, useRef, type CSSProperties } from 'react';

/**
 * A soft light that follows the pointer across a card, in the card's own
 * section colour. It listens on the card itself, so the card stays a server
 * component and only this small span runs in the browser. Not motion in the
 * reduced-motion sense — it moves only when the pointer does.
 */
export function CardGlow({ color }: { color: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    const host = el?.parentElement;
    if (!el || !host) return;
    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      el.style.setProperty('--x', `${event.clientX - rect.left}px`);
      el.style.setProperty('--y', `${event.clientY - rect.top}px`);
    };
    host.addEventListener('pointermove', move);
    return () => host.removeEventListener('pointermove', move);
  }, []);

  return (
    <span
      ref={ref}
      aria-hidden
      style={{ '--glow': color } as CSSProperties}
      className="card-glow pointer-events-none absolute inset-0 -z-10 rounded-[inherit] opacity-0 transition-opacity duration-[var(--duration-base)] group-hover/card:opacity-100"
    />
  );
}
