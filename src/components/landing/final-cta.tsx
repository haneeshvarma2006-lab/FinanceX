import { ArrowRight } from 'lucide-react';
import { FadeUp, Magnetic, WordReveal } from './motion';
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
    <section className="py-24 sm:py-32">
      <Container>
        <div className="lp-card relative isolate flex flex-col items-center gap-8 overflow-hidden rounded-4xl px-6 py-20 text-center sm:py-28">
          {/* A turning halo of the three colours, centred behind the headline,
          under a horizon glow — the hero's light, returning at the end. */}
          <div aria-hidden className="lp-horizon pointer-events-none absolute inset-0 -z-10" />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center"
          >
            <div className="lp-halo size-80 rounded-full opacity-20 blur-3xl sm:size-120" />
          </div>

          <FadeUp className="flex flex-col items-center gap-5">
            <h2 className="max-w-4xl text-5xl leading-[1] font-semibold tracking-tighter text-brand-ink sm:text-7xl">
              <WordReveal
                onMount={false}
                lines={[
                  [
                    { text: 'Build', className: 'lp-ink' },
                    { text: 'a', className: 'lp-ink' },
                    { text: 'more', className: 'lp-ink' },
                  ],
                  [
                    {
                      text: 'intentional',
                      className: 'lp-ink-soft',
                    },
                    { text: 'life.', className: 'lp-ink-soft' },
                  ],
                ]}
              />
            </h2>
            <p className="max-w-lg text-lg text-pretty text-brand-ink-muted">
              {signedIn
                ? 'Your tasks, money and trading are waiting where you left them.'
                : 'Early access is open. Be among the first to run your tasks, money and trading from the personal wealth operating system.'}
            </p>
          </FadeUp>

          {signedIn ? (
            <FadeUp delay={0.08}>
              <Magnetic>
                <ButtonLink href="/today" className="h-12 px-6">
                  Open your dashboard <ArrowRight aria-hidden className="size-4" />
                </ButtonLink>
              </Magnetic>
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
        </div>
      </Container>
    </section>
  );
}
