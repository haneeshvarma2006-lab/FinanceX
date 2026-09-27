import { ArrowDown, Workflow } from 'lucide-react';
import { brand } from '@/lib/brand';
import { cn } from '@/lib/cn';
import type { Tone } from './charts';
import { flows } from './data';
import { FadeUp, GlowCard, Pulse } from './motion';
import { Container, SectionHeader, TONE_TEXT, ToneChip, type IconName } from './primitives';

/**
 * "How it connects" — the reason the product exists.
 *
 * Each column is one chain of cause and effect, drawn top to bottom the way
 * the brief sketched it. Connectors blend from one step's colour into the
 * next's, and a dot travels down them, staggered, so the eye reads an event
 * propagating rather than four unrelated boxes.
 *
 * Under each chain is the rule that turns the alert into a task, written the
 * way the rules page shows it. A rule has exactly one action; the losing-streak
 * one ships enabled, the other two take a minute to add on the Rules page.
 *
 * That is the honest version of "intelligent": the product does this because
 * of a rule you can read, pause and edit — not a black box.
 */

const FROM: Record<Tone, string> = {
  tasks: 'from-brand-tasks',
  finance: 'from-brand-finance',
  trading: 'from-brand-trading',
};
const TO: Record<Tone, string> = {
  tasks: 'to-brand-tasks',
  finance: 'to-brand-finance',
  trading: 'to-brand-trading',
};
/** A lit top edge in the chain's colour: the card's identity at a glance. */
const EDGE: Record<Tone, string> = {
  tasks: 'via-brand-tasks',
  finance: 'via-brand-finance',
  trading: 'via-brand-trading',
};

const RULES: Record<string, { when: string; then: string }> = {
  trading: { when: '3 losing trades in a row', then: 'create task “Review recent trades”' },
  finance: { when: 'a budget is exceeded', then: 'create task “Review this month’s spending”' },
  goals: { when: 'a goal falls behind pace', then: 'create task “Catch up on savings”' },
};

function Step({
  step,
  index,
  last,
  next,
}: {
  step: (typeof flows)[number]['steps'][number];
  index: number;
  last: boolean;
  next?: Tone;
}) {
  return (
    <li className="relative flex flex-col">
      <div className="flex items-start gap-3.5">
        {/* Ripples as the travelling dot arrives, so the eye follows the
            event from one step into the next. */}
        <span
          className={cn('lp-ping inline-flex', TONE_TEXT[step.tone])}
          style={{ animationDelay: `${index === 0 ? 0 : (index - 1) * 600 + 1750}ms` }}
        >
          <ToneChip tone={step.tone} icon={step.icon as IconName} />
        </span>
        <div className="min-w-0 pt-0.5">
          <p className="text-sm font-medium text-brand-ink">{step.label}</p>
          <p className="mt-0.5 text-xs text-brand-ink-muted">{step.detail}</p>
        </div>
      </div>

      {!last && next && (
        <div aria-hidden className="relative ml-4 h-9 w-0.5 -translate-x-px">
          <span
            className={cn(
              'absolute inset-0 rounded-full bg-linear-to-b opacity-70',
              FROM[step.tone],
              TO[next],
            )}
          />
          <Pulse tone={next} delay={index * 0.6} />
        </div>
      )}
    </li>
  );
}

export function ConnectedFlows() {
  return (
    <section
      id="connected"
      className="relative scroll-mt-20 overflow-hidden border-y border-brand-line/60 bg-brand-card/20 py-24 sm:py-32"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 size-96 -translate-x-1/2 rounded-full bg-brand-tasks/10 blur-3xl"
      />

      <Container className="relative flex flex-col gap-14">
        <FadeUp>
          <SectionHeader
            eyebrow="How it connects"
            title={
              <>
                Everything talks to <em>everything else.</em>
              </>
            }
            body={`Separate apps stop at their own edge. In ${brand.name}, something that happens in one part of your life becomes action in another — automatically, through rules you can read and change.`}
          />
        </FadeUp>

        <div className="grid gap-4 lg:grid-cols-3">
          {flows.map((flow, i) => (
            <FadeUp key={flow.id} delay={i * 0.08}>
              <GlowCard tone={flow.tone} className="h-full">
                <span
                  aria-hidden
                  className={cn(
                    'absolute inset-x-8 top-0 h-px bg-linear-to-r from-transparent to-transparent',
                    EDGE[flow.tone],
                  )}
                />
                <div className="flex h-full flex-col gap-6 p-6 sm:p-7">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-base font-semibold tracking-tight text-brand-ink">
                      {flow.title}
                    </h3>
                    <span className="font-figures text-2xs text-brand-ink-subtle tabular-nums">
                      0{i + 1}
                    </span>
                  </div>

                  <ol aria-label={flow.title} className="flex flex-col">
                    {flow.steps.map((step, s) => (
                      <Step
                        key={step.label}
                        step={step}
                        index={s}
                        last={s === flow.steps.length - 1}
                        next={flow.steps[s + 1]?.tone}
                      />
                    ))}
                  </ol>

                  <div className="mt-auto rounded-lg border border-brand-line/80 bg-brand-canvas/70 p-3 font-code text-2xs leading-relaxed">
                    <p className="mb-1 inline-flex items-center gap-1.5 text-brand-ink-subtle">
                      <Workflow aria-hidden className="size-3" /> The rule behind it
                    </p>
                    <p className="text-brand-ink-muted">
                      <span className="text-brand-ink">When</span> {RULES[flow.id]!.when}
                    </p>
                    <p className="text-brand-ink-muted">
                      <span className="text-brand-ink">Then</span> {RULES[flow.id]!.then}
                    </p>
                  </div>
                </div>
              </GlowCard>
            </FadeUp>
          ))}
        </div>

        <FadeUp className="flex justify-center">
          <p className="inline-flex items-center gap-2 text-sm text-brand-ink-muted">
            <ArrowDown aria-hidden className="size-4 text-brand-ink-subtle" />
            Every rule is visible, editable, and can be paused. Nothing happens you cannot see.
          </p>
        </FadeUp>
      </Container>
    </section>
  );
}
