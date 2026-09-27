'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  animate,
  AnimatePresence,
  MotionConfig,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
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
      className="fixed inset-x-0 top-0 z-70 h-0.5 origin-left bg-linear-to-r from-brand-tasks via-brand-trading to-brand-finance"
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
  // Lets the charts inside play their entrance when the card arrives.
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const reduced = useReducedMotion();
  // A few degrees of tilt toward the pointer, on springs.
  const rotateX = useSpring(0, { stiffness: 200, damping: 22 });
  const rotateY = useSpring(0, { stiffness: 200, damping: 22 });

  return (
    <motion.div
      ref={ref}
      data-inview={inView ? 'true' : 'false'}
      whileHover={{ y: -3 }}
      transition={{ duration: 0.25, ease: EASE }}
      onPointerMove={(event) => {
        const el = ref.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        el.style.setProperty('--x', `${x}px`);
        el.style.setProperty('--y', `${y}px`);
        if (!reduced) {
          rotateX.set((0.5 - y / rect.height) * 4);
          rotateY.set((x / rect.width - 0.5) * 5);
        }
      }}
      onPointerLeave={() => {
        rotateX.set(0);
        rotateY.set(0);
      }}
      style={
        {
          '--glow': GLOW[tone],
          rotateX,
          rotateY,
          transformPerspective: 1200,
        } as unknown as CSSProperties
      }
      className={cn(
        'lp-card lp-glow lp-tilt group relative overflow-hidden rounded-3xl backdrop-blur-sm',
        'transition-shadow duration-[var(--duration-base)] hover:shadow-[var(--shadow-sheet)]',
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
  // Hidden by CSS rather than by not rendering, so the server and client
  // trees always match whatever the visitor's motion setting.
  return (
    <motion.span
      aria-hidden
      className={cn(
        'absolute left-1/2 size-1.5 -translate-x-1/2 rounded-full motion-reduce:hidden',
        PULSE[tone],
      )}
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

/* ------------------------------------------------------------------ words */

type Word = { text: string; className?: string; style?: CSSProperties };

/**
 * A headline that arrives word by word: each word rises out of a blur a beat
 * after the last. Lines are kept as blocks so the break is always where it
 * was designed to be; screen readers get the words as ordinary text.
 */
export function WordReveal({
  lines,
  delay = 0,
  onMount = true,
}: {
  lines: readonly (readonly Word[])[];
  delay?: number;
  onMount?: boolean;
}) {
  let n = 0;
  const hidden = { opacity: 0, y: '0.45em', filter: 'blur(10px)' };
  const shown = { opacity: 1, y: '0em', filter: 'blur(0px)' };
  return (
    <>
      {lines.map((line, l) => (
        <span key={l} className="block">
          {line.map((word, w) => {
            const i = n++;
            return (
              <span key={w}>
                <motion.span
                  className={cn('inline-block will-change-transform', word.className)}
                  style={word.style}
                  initial={hidden}
                  {...(onMount
                    ? { animate: shown }
                    : { whileInView: shown, viewport: { once: true, margin: '-60px' } })}
                  transition={{ duration: 0.7, ease: EASE, delay: delay + i * 0.07 }}
                >
                  {word.text}
                </motion.span>
                {w < line.length - 1 ? ' ' : null}
              </span>
            );
          })}
        </span>
      ))}
    </>
  );
}

/* --------------------------------------------------------------- 3D stage */

/**
 * The hero stage. On scroll the dashboard starts tipped back in perspective
 * and settles flat as it reaches you; under the pointer it tilts a few
 * degrees toward the cursor on springs, so it feels like an object on the
 * desk rather than a picture of one.
 */
export function TiltStage({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'center center'] });
  const settle = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });
  const scrollTilt = useTransform(settle, [0, 1], [22, 0]);
  const scale = useTransform(settle, [0, 1], [0.94, 1]);

  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rx = useSpring(useTransform(py, [-0.5, 0.5], [6, -6]), { stiffness: 150, damping: 18 });
  const ry = useSpring(useTransform(px, [-0.5, 0.5], [-8, 8]), { stiffness: 150, damping: 18 });
  const rotateX = useTransform(() => scrollTilt.get() + rx.get());

  // The same tree renders on the server and for everyone; the reduced-motion
  // stylesheet flattens `.lp-tilt`, so no one who asked for stillness gets it.
  return (
    <div ref={ref} className={cn('[perspective:1600px]', className)}>
      <motion.div
        className="lp-tilt"
        style={{ rotateX, rotateY: ry, scale, transformStyle: 'preserve-3d' }}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          px.set((event.clientX - rect.left) / rect.width - 0.5);
          py.set((event.clientY - rect.top) / rect.height - 0.5);
        }}
        onPointerLeave={() => {
          px.set(0);
          py.set(0);
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}

/* --------------------------------------------------------------- magnetic */

/** Leans a button a few pixels toward the pointer, and springs back. */
export function Magnetic({ children, className }: { children: ReactNode; className?: string }) {
  const x = useSpring(0, { stiffness: 260, damping: 18 });
  const y = useSpring(0, { stiffness: 260, damping: 18 });
  return (
    <motion.div
      className={cn('lp-tilt inline-flex', className)}
      style={{ x, y }}
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        x.set((event.clientX - rect.left - rect.width / 2) * 0.25);
        y.set((event.clientY - rect.top - rect.height / 2) * 0.35);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}

/* ----------------------------------------------------------------- in view */

/**
 * Marks a region `data-inview="true"` once it scrolls into view, so plain CSS
 * can play its entrance — charts drawing, bars rising, meters filling —
 * without each chart becoming a client component.
 */
export function InView({
  children,
  className,
  as: Tag = 'div',
  'aria-label': ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'figure';
  'aria-label'?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  return (
    <Tag
      ref={ref}
      data-inview={inView ? 'true' : 'false'}
      aria-label={ariaLabel}
      className={className}
    >
      {children}
    </Tag>
  );
}

/* --------------------------------------------------------------- spotlight */

/**
 * A soft light that follows the pointer across the hero, brightening the grid
 * beneath it. Pointer-only: on touch there is no hover, so nothing shows.
 */
export function Spotlight({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    const host = el?.parentElement;
    if (!el || !host) return;
    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      el.style.setProperty('--x', `${event.clientX - rect.left}px`);
      el.style.setProperty('--y', `${event.clientY - rect.top}px`);
      el.style.opacity = '1';
    };
    const leave = () => {
      el.style.opacity = '0';
    };
    host.addEventListener('pointermove', move);
    host.addEventListener('pointerleave', leave);
    return () => {
      host.removeEventListener('pointermove', move);
      host.removeEventListener('pointerleave', leave);
    };
  }, []);

  return <div ref={ref} aria-hidden className={cn('lp-spotlight', className)} />;
}

/* ------------------------------------------------------------ event stream */

export type StreamEvent = {
  key: string;
  icon: ReactNode;
  chip: string;
  title: string;
  body: string;
};

/**
 * One notification slot beside the hero dashboard that cycles through the
 * events the product raises — each springs in, holds, and gives way to the
 * next — like watching the system work. With reduced motion it holds the
 * first event and never cycles.
 */
export function EventStream({
  events,
  className,
  interval = 3200,
}: {
  events: readonly StreamEvent[];
  className?: string;
  interval?: number;
}) {
  const [index, setIndex] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced || events.length < 2) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % events.length), interval);
    return () => window.clearInterval(id);
  }, [reduced, events.length, interval]);

  const event = events[index]!;

  return (
    <div className={className}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={event.key}
          initial={{ opacity: 0, y: 14, scale: 0.92, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -10, scale: 0.96, filter: 'blur(4px)' }}
          transition={{ type: 'spring', stiffness: 320, damping: 26 }}
          className="flex items-center gap-3 rounded-xl border border-brand-line bg-brand-card/90 py-2.5 pr-4 pl-2.5 shadow-[var(--shadow-sheet)] backdrop-blur-xl"
        >
          <span
            className={cn(
              'relative inline-flex size-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset',
              event.chip,
            )}
          >
            {event.icon}
            <span className="absolute -top-0.5 -right-0.5 size-2 animate-ping rounded-full bg-current opacity-60" />
            <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-current" />
          </span>
          <span>
            <span className="block text-xs font-medium text-brand-ink">{event.title}</span>
            <span className="block text-2xs whitespace-nowrap text-brand-ink-muted">
              {event.body}
            </span>
          </span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
