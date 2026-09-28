import { ArrowRight, BellRing, Flame, ListChecks, Wallet } from 'lucide-react';
import { brand } from '@/lib/brand';
import { DashboardMockup } from './dashboard-mockup';
import { EXAMPLE_NOTE } from './data';
import {
  EventStream,
  FadeUp,
  Magnetic,
  Spotlight,
  TiltStage,
  WordReveal,
  type StreamEvent,
} from './motion';
import { ButtonLink, Container, Eyebrow, TONE_SOFT } from './primitives';

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

const INK = 'lp-ink';
const SOFT = 'lp-ink-soft';

/**
 * The hero, centred and quiet: one light source above, one sentence set
 * large in two tones of ink, and the product rising into view below
 * it in perspective. Everything moves once, on arrival, then gets out of
 * the way.
 */
export function Hero({ signedIn = false }: { signedIn?: boolean }) {
  return (
    // Pulled up under the floating nav so the light starts at the very top
    // of the window rather than at a line below the bar.
    <section className="relative -mt-18 overflow-hidden pt-38 sm:-mt-19 sm:pt-48">
      {/* One light source: a soft horizon glow that breathes very slowly. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-240">
        <div className="lp-horizon lp-breathe absolute inset-0" />
      </div>
      <Spotlight />

      <Container className="relative flex flex-col items-center text-center">
        <FadeUp onMount>
          <Eyebrow>
            <span aria-hidden className="flex gap-1">
              <span className="size-1.5 rounded-full bg-brand-tasks" />
              <span className="size-1.5 rounded-full bg-brand-finance" />
              <span className="size-1.5 rounded-full bg-brand-trading" />
            </span>
            {brand.category}
          </Eyebrow>
        </FadeUp>

        <h1 className="mt-8 max-w-5xl text-5xl leading-[0.98] font-semibold tracking-tighter text-balance text-brand-ink sm:text-7xl lg:text-8xl">
          <WordReveal
            delay={0.15}
            lines={[
              [
                { text: 'Your', className: INK },
                { text: 'work,', className: INK },
                { text: 'money', className: INK },
                { text: '&', className: INK },
                { text: 'trades', className: INK },
              ],
              [
                { text: 'in', className: INK },
                { text: 'one', className: SOFT },
                { text: 'calm', className: SOFT },
                { text: 'flow.', className: SOFT },
              ],
            ]}
          />
        </h1>

        <FadeUp onMount delay={0.7}>
          <p className="mt-7 max-w-2xl text-lg text-pretty text-brand-ink-muted sm:text-xl">
            A task manager, a finance tracker and a trading journal, built as one system — so what
            happens in one part of your life becomes action in the others.
          </p>
        </FadeUp>

        <FadeUp onMount delay={0.85} className="mt-10 flex flex-wrap justify-center gap-3">
          <Magnetic>
            <ButtonLink href={signedIn ? '/today' : '/sign-up'} className="group h-12 px-6">
              {signedIn ? 'Open your dashboard' : 'Get early access'}
              <ArrowRight
                aria-hidden
                className="size-4 transition-transform duration-[var(--duration-base)] group-hover:translate-x-1"
              />
            </ButtonLink>
          </Magnetic>
          <Magnetic>
            <ButtonLink href="#connected" variant="secondary" className="h-12 px-6">
              See how it works
            </ButtonLink>
          </Magnetic>
        </FadeUp>

        <FadeUp onMount delay={1}>
          <p className="mt-6 text-xs text-brand-ink-subtle">
            No card required · Your data, exportable any time · Black &amp; White themes
          </p>
        </FadeUp>
      </Container>

      {/* The product, rising into place under a beam of light. */}
      <Container className="relative mt-16 sm:mt-24">
        <FadeUp onMount delay={0.5} className="relative mx-auto max-w-6xl">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-px z-20 flex justify-center"
          >
            <div className="lp-beam h-px w-3/4" />
          </div>
          <div
            aria-hidden
            className="lp-beam-glow pointer-events-none absolute inset-x-0 -top-24 h-72"
          />

          <div className="lp-fade-bottom">
            <TiltStage>
              <DashboardMockup />
            </TiltStage>
          </div>

          {/* Wide screens only: on a phone it would cover the dashboard. It
              sits over the faded lower edge, where it hides nothing. */}
          <div
            aria-hidden
            className="pointer-events-none absolute right-10 bottom-14 z-20 hidden lg:block"
          >
            <EventStream events={EVENTS} />
          </div>
        </FadeUp>
        <p className="mt-2 pb-6 text-center text-2xs text-brand-ink-subtle">{EXAMPLE_NOTE}</p>
      </Container>
    </section>
  );
}
