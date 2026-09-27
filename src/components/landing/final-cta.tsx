import { ArrowRight } from 'lucide-react';
import { FadeUp } from './motion';
import { ButtonLink, Container } from './primitives';

/**
 * The closing ask.
 *
 * Early access is open, so the email field does not feed a waitlist that
 * nobody reads: it carries the address straight into sign-up. A plain GET
 * form, so it works before JavaScript loads and with it disabled. Someone
 * already signed in gets the way back into the app instead.
 */
export function FinalCta({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <section className="relative overflow-hidden py-28 sm:py-36">
      <div aria-hidden className="lp-grid pointer-events-none absolute inset-0 rotate-180" />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-1/2 size-96 -translate-x-1/2 translate-y-1/2 rounded-full bg-brand-trading/15 blur-3xl"
      />

      <Container className="relative flex flex-col items-center gap-8 text-center">
        <FadeUp className="flex flex-col items-center gap-5">
          <h2 className="max-w-3xl text-4xl font-semibold tracking-tighter text-brand-ink sm:text-6xl">
            Build a more intentional life.
          </h2>
          <p className="max-w-lg text-lg text-pretty text-brand-ink-muted">
            {signedIn
              ? 'Your tasks, money and trading are waiting where you left them.'
              : 'Early access is open. Be among the first to run your tasks, money and trading from the personal wealth operating system.'}
          </p>
        </FadeUp>

        {signedIn ? (
          <FadeUp delay={0.08}>
            <ButtonLink href="/today" className="h-12 px-6">
              Open your dashboard <ArrowRight aria-hidden className="size-4" />
            </ButtonLink>
          </FadeUp>
        ) : (
          <FadeUp delay={0.08} className="w-full max-w-md">
            <form action="/sign-up" method="get" className="flex flex-col gap-2 sm:flex-row">
              <label htmlFor="cta-email" className="sr-only">
                Email address
              </label>
              <input
                id="cta-email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="h-12 min-w-0 flex-1 rounded-full border border-brand-line bg-brand-card/70 px-5 text-sm text-brand-ink placeholder:text-brand-ink-subtle backdrop-blur transition-colors focus:border-brand-ink-subtle"
              />
              <button
                type="submit"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand-ink px-6 text-sm font-medium text-brand-canvas transition-[background-color,box-shadow] duration-[var(--duration-fast)] hover:bg-brand-ink/90 hover:shadow-[var(--shadow-overlay)]"
              >
                Get early access <ArrowRight aria-hidden className="size-4" />
              </button>
            </form>
            <p className="mt-3 text-xs text-brand-ink-subtle">
              No card required. No ads, no tracking, and your data is not shared with anyone.
            </p>
          </FadeUp>
        )}
      </Container>
    </section>
  );
}
