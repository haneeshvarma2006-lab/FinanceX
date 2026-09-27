import type { CSSProperties } from 'react';
import { ArrowRight, BellRing, CandlestickChart, Flame, ListChecks, Wallet } from 'lucide-react';
import { brand } from '@/lib/brand';
import { DashboardMockup } from './dashboard-mockup';
import { EXAMPLE_NOTE, replaces } from './data';
import {
  EventStream,
  FadeUp,
  Float,
  Magnetic,
  Spotlight,
  TiltStage,
  WordReveal,
  type StreamEvent,
} from './motion';
import { ButtonLink, Container, Eyebrow, TONE_SOFT } from './primitives';
import type { Tone } from './charts';

const sheen = (tone: Tone) => ({ '--sheen': `var(--brand-${tone})` }) as CSSProperties;

/**
 * Events the product raises, cycling in one slot beside the dashboard. Each
 * is something a rule or a screen really does, inside the example-data frame
 * like the dashboard itself.
 */
const EVENTS: readonly StreamEvent[] = [
  {
    key: 'rule',
    icon: <BellRing aria-hidden className="size-4" strokeWidth={1.75} />,
    chip: TONE_SOFT.trading,
    title: 'Rule fired',
    body: '3 losses in a row → review task',
  },
  {
    key: 'budget',
    icon: <Wallet aria-hidden className="size-4" strokeWidth={1.75} />,
    chip: TONE_SOFT.finance,
    title: 'Budget passed',
    body: 'Dining is 18% over plan',
  },
  {
    key: 'streak',
    icon: <Flame aria-hidden className="size-4" strokeWidth={1.75} />,
    chip: TONE_SOFT.tasks,
    title: 'Streak kept',
    body: 'Morning walk · 12 days',
  },
  {
    key: 'task',
    icon: <ListChecks aria-hidden className="size-4" strokeWidth={1.75} />,
    chip: TONE_SOFT.tasks,
    title: 'Task scheduled',
    body: 'Pay credit card · repeats monthly',
  },
];

export function Hero({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <section className="relative overflow-hidden pt-16 pb-24 sm:pt-24 lg:pb-32">
      {/* Aurora: three domain lights drifting behind everything, very slowly. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="lp-aurora-a absolute top-10 right-0 size-120 rounded-full bg-brand-trading/14 blur-3xl" />
        <div className="lp-aurora-b absolute top-72 right-80 size-96 rounded-full bg-brand-tasks/14 blur-3xl" />
        <div className="lp-aurora-c absolute -top-20 left-10 size-80 rounded-full bg-brand-finance/10 blur-3xl" />
      </div>
      <div aria-hidden className="lp-grid pointer-events-none absolute inset-0" />
      <Spotlight />

      <Container className="relative grid items-center gap-16 lg:grid-cols-12 lg:gap-10">
        <div className="flex flex-col items-start gap-7 lg:col-span-6 xl:col-span-5">
          <FadeUp onMount>
            <Eyebrow>
              <span aria-hidden className="flex gap-1">
                <span className="size-1.5 animate-pulse rounded-full bg-brand-tasks" />
                <span className="size-1.5 animate-pulse rounded-full bg-brand-finance [animation-delay:300ms]" />
                <span className="size-1.5 animate-pulse rounded-full bg-brand-trading [animation-delay:600ms]" />
              </span>
              {brand.category}
            </Eyebrow>
          </FadeUp>

          <h1 className="text-4xl leading-[1.05] font-semibold tracking-tighter text-balance text-brand-ink sm:text-6xl lg:text-5xl xl:text-6xl">
            <WordReveal
              delay={0.1}
              lines={[
                [{ text: 'One' }, { text: 'system' }, { text: 'for' }],
                [
                  { text: 'Tasks,', className: 'lp-sheen', style: sheen('tasks') },
                  { text: 'Money', className: 'lp-sheen', style: sheen('finance') },
                  { text: '&' },
                  { text: 'Trading.', className: 'lp-sheen', style: sheen('trading') },
                ],
              ]}
            />
          </h1>

          <FadeUp onMount delay={0.55}>
            <p className="max-w-md text-lg text-pretty text-brand-ink-muted">
              Stop switching between apps. Manage your work, finances, and trading performance from
              a single intelligent command center.
            </p>
          </FadeUp>

          <FadeUp onMount delay={0.7} className="flex flex-wrap gap-3">
            <Magnetic>
              <ButtonLink href={signedIn ? '/today' : '/sign-up'} className="group">
                {signedIn ? 'Open your dashboard' : 'Get early access'}{' '}
                <ArrowRight
                  aria-hidden
                  className="size-4 transition-transform duration-[var(--duration-base)] group-hover:translate-x-1"
                />
              </ButtonLink>
            </Magnetic>
            <Magnetic>
              <ButtonLink href="#connected" variant="secondary">
                See how it works
              </ButtonLink>
            </Magnetic>
          </FadeUp>

          <FadeUp onMount delay={0.85} className="flex flex-col gap-3 pt-2">
            <p className="text-xs text-brand-ink-subtle">Replaces the stack you juggle today</p>
            <ul className="flex flex-wrap gap-2">
              {replaces.map((item) => (
                <li
                  key={item}
                  className="rounded-full border border-brand-line/80 px-2.5 py-1 text-2xs text-brand-ink-muted line-through decoration-brand-ink-subtle/60"
                >
                  {item}
                </li>
              ))}
            </ul>
          </FadeUp>
        </div>

        <FadeUp onMount delay={0.3} className="relative lg:col-span-6 xl:col-span-7">
          <TiltStage>
            <Float>
              <DashboardMockup />
            </Float>
          </TiltStage>

          {/* Wide screens only: on a phone it would cover the dashboard it
              is annotating. It sits over the bottom-left corner, beside the
              insight it echoes. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -left-8 bottom-24 z-10 hidden lg:block"
          >
            <EventStream events={EVENTS} />
          </div>

          <div className="mt-6 flex items-center justify-center gap-5 text-2xs text-brand-ink-subtle">
            <span className="inline-flex items-center gap-1.5">
              <ListChecks aria-hidden className="size-3.5 text-brand-tasks" /> Tasks
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Wallet aria-hidden className="size-3.5 text-brand-finance" /> Money
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CandlestickChart aria-hidden className="size-3.5 text-brand-trading" /> Trading
            </span>
            <span aria-hidden>·</span>
            <span>{EXAMPLE_NOTE}</span>
          </div>
        </FadeUp>
      </Container>
    </section>
  );
}
