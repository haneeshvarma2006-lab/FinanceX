'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  animate,
  MotionConfig,
  motion,
  useInView,
  useReducedMotion,
  useScroll,
  useSpring,
  type Transition,
} from 'framer-motion';
import { cn } from '@/lib/cn';

/**
 * Motion for the landing page. Deliberately small: a fade, a float, a lift, a
 * counter and a pulse. Everything honours the operating system's reduced-
 * motion setting through `MotionConfig`, and nothing loops except the two
 * ambient effects that carry meaning (the floating dashboard, the pulses that
 * show one event flowing into the next).
 */

const EASE: Transition['ease'] = [0.22, 1, 0.36, 1];

export function MotionRoot({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

export function FadeUp({
  children,
  delay = 0,
  className,
  onMount = false,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  /** Animate on load rather than on scroll — for content already in view. */
  onMount?: boolean;
}) {
  // A little blur clearing as the block rises: the content comes into focus
  // rather than merely sliding in.
  const reveal = { opacity: 1, y: 0, filter: 'blur(0px)' };
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 18, filter: 'blur(8px)' }}
      {...(onMount
        ? { animate: reveal }
        : { whileInView: reveal, viewport: { once: true, margin: '-80px' } })}
      transition={{ duration: 0.6, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

/**
 * A hairline across the bottom of the nav that fills with the three domain
 * colours as you read down the page.
 */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 220, damping: 40, restDelta: 0.001 });
  return (
    <motion.div
      aria-hidden
      style={{ scaleX }}
      className="absolute inset-x-0 -bottom-px h-px origin-left bg-linear-to-r from-brand-tasks via-brand-trading to-brand-finance"
    />
  );
}

/** A slow drift, so the hero dashboard reads as a live object, not a screenshot. */
export function Float({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      animate={{ y: [0, -8, 0] }}
      transition={{ duration: 7, ease: 'easeInOut', repeat: Infinity }}
    >
      {children}
    </motion.div>
  );
}

/**
 * A card that lifts on hover and carries a soft glow that follows the pointer.
 * The glow's colour is the card's domain accent, so it reinforces which part
 * of the product you are looking at rather than decorating for its own sake.
 */
export function GlowCard({
  children,
  className,
  tone,
}: {
  children: ReactNode;
  className?: string;
  tone: 'tasks' | 'finance' | 'trading' | 'neutral';
}) {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <motion.div
      ref={ref}
      whileHover={{ y: -3 }}
      transition={{ duration: 0.25, ease: EASE }}
      onPointerMove={(event) => {
        const el = ref.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        el.style.setProperty('--x', `${event.clientX - rect.left}px`);
        el.style.setProperty('--y', `${event.clientY - rect.top}px`);
      }}
      style={{ '--glow': GLOW[tone] } as CSSProperties}
      className={cn(
        'lp-glow group relative overflow-hidden rounded-2xl border border-brand-line',
        'bg-brand-card/60 backdrop-blur-sm',
        'transition-colors duration-[var(--duration-base)] hover:border-brand-line/0',
        'hover:shadow-[var(--shadow-overlay)]',
        className,
      )}
    >
      {children}
    </motion.div>
  );
}

const GLOW = {
  tasks: 'var(--brand-tasks)',
  finance: 'var(--brand-finance)',
  trading: 'var(--brand-trading)',
  neutral: 'var(--brand-ink-muted)',
} as const;

/**
 * A number that counts up the first time it scrolls into view.
 *
 * The final value is what renders on the server, so the page is correct with
 * JavaScript off and for anything that reads the HTML. The count only happens
 * for people who will actually see it move.
 */
export function Counter({
  value,
  format,
  className,
}: {
  value: number;
  format: 'inr' | 'percent' | 'signedPercent' | 'decimal';
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);

  useEffect(() => {
    if (!inView || reduced) return;
    const controls = animate(0, value, {
      duration: 1.4,
      ease: EASE,
      onUpdate: setShown,
    });
    return () => controls.stop();
  }, [inView, reduced, value]);

  return (
    <span ref={ref} className={cn('font-figures tabular-nums', className)}>
      {FORMAT[format](shown)}
    </span>
  );
}

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const FORMAT = {
  inr: (n: number) => inr.format(Math.round(n)),
  percent: (n: number) => `${Math.round(n)}%`,
  signedPercent: (n: number) => `+${n.toFixed(1)}%`,
  decimal: (n: number) => n.toFixed(2),
} as const;

/**
 * A dot travelling down a connector: one event becoming the next. Hidden when
 * the user prefers reduced motion, since a static dot would only be noise.
 */
export function Pulse({
  tone,
  delay = 0,
}: {
  tone: 'tasks' | 'finance' | 'trading';
  delay?: number;
}) {
  const reduced = useReducedMotion();
  if (reduced) return null;

  return (
    <motion.span
      aria-hidden
      className={cn('absolute left-1/2 size-1.5 -translate-x-1/2 rounded-full', PULSE[tone])}
      initial={{ top: '0%', opacity: 0 }}
      animate={{ top: ['0%', '100%'], opacity: [0, 1, 1, 0] }}
      transition={{ duration: 1.8, ease: 'easeInOut', repeat: Infinity, delay, repeatDelay: 1.2 }}
    />
  );
}

const PULSE = {
  tasks: 'lp-dot bg-brand-tasks text-brand-tasks',
  finance: 'lp-dot bg-brand-finance text-brand-finance',
  trading: 'lp-dot bg-brand-trading text-brand-trading',
} as const;
