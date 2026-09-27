import { ArrowRight, CandlestickChart, ListChecks, Wallet } from 'lucide-react';
import { brand } from '@/lib/brand';
import { DashboardMockup } from './dashboard-mockup';
import { EXAMPLE_NOTE, replaces } from './data';
import { FadeUp, Float } from './motion';
import { ButtonLink, Container, Eyebrow } from './primitives';

export function Hero({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <section className="relative overflow-hidden pt-16 pb-24 sm:pt-24 lg:pb-32">
      {/* Texture and light, both faint: a grid that fades out, and one glow
          per domain sitting behind the dashboard rather than across the page. */}
      <div aria-hidden className="lp-grid pointer-events-none absolute inset-0" />
      <div
        aria-hidden
        className="pointer-events-none absolute top-24 right-0 size-96 rounded-full bg-brand-trading/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-64 right-64 size-80 rounded-full bg-brand-tasks/10 blur-3xl"
      />

      <Container className="relative grid items-center gap-16 lg:grid-cols-12 lg:gap-10">
        <div className="flex flex-col items-start gap-7 lg:col-span-6 xl:col-span-5">
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

          <FadeUp onMount delay={0.05}>
            <h1 className="text-4xl leading-[1.05] font-semibold tracking-tighter text-balance text-brand-ink sm:text-6xl lg:text-5xl xl:text-6xl">
              <span className="block">One system for</span>
              <span className="block">
                <span className="text-brand-tasks">Tasks</span>,{' '}
                <span className="text-brand-finance">Money</span> &amp;{' '}
                <span className="text-brand-trading">Trading</span>.
              </span>
            </h1>
          </FadeUp>

          <FadeUp onMount delay={0.1}>
            <p className="max-w-md text-lg text-pretty text-brand-ink-muted">
              Stop switching between apps. Manage your work, finances, and trading performance from
              a single intelligent command center.
            </p>
          </FadeUp>

          <FadeUp onMount delay={0.15} className="flex flex-wrap gap-3">
            <ButtonLink href={signedIn ? '/today' : '/sign-up'}>
              {signedIn ? 'Open your dashboard' : 'Get early access'}{' '}
              <ArrowRight aria-hidden className="size-4" />
            </ButtonLink>
            <ButtonLink href="#connected" variant="secondary">
              See how it works
            </ButtonLink>
          </FadeUp>

          <FadeUp onMount delay={0.2} className="flex flex-col gap-3 pt-2">
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

        <FadeUp onMount delay={0.15} className="relative lg:col-span-6 xl:col-span-7">
          <Float>
            <DashboardMockup />
          </Float>
          <div className="mt-4 flex items-center justify-center gap-5 text-2xs text-brand-ink-subtle">
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
