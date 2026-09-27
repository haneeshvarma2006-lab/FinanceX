import { brand } from '@/lib/brand';
import { cn } from '@/lib/cn';
import { personas } from './data';
import { FadeUp, GlowCard } from './motion';
import { Container, ICONS, SectionHeader, TONE_SOFT, type IconName } from './primitives';

/**
 * Who it is for.
 *
 * This sits where testimonials usually go, and on purpose it is not
 * testimonials. There are no customers yet whose words could be quoted, and
 * invented quotes with stock photos of people who never used the product are
 * fake reviews — misleading, and unlawful in the markets this is aimed at.
 * When real users say something worth quoting, with their permission, it
 * belongs here; until then this says plainly who the product is built for.
 */
export function Audience() {
  return (
    <section className="py-24 sm:py-32">
      <Container className="flex flex-col gap-14">
        <FadeUp>
          <SectionHeader
            eyebrow="Who it is for"
            title={
              <>
                Built for people <em>building wealth.</em>
              </>
            }
            body={`${brand.name} is for anyone who treats their time, money and risk as one portfolio — and wants the tools to agree.`}
          />
        </FadeUp>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {personas.map((persona, i) => {
            const Icon = ICONS[persona.icon as IconName];
            return (
              <FadeUp key={persona.who} delay={i * 0.06}>
                <GlowCard tone={persona.tone} className="h-full">
                  <figure className="flex h-full flex-col gap-6 p-6">
                    <span
                      aria-hidden
                      className={cn(
                        'inline-flex size-11 items-center justify-center rounded-full ring-1 ring-inset',
                        TONE_SOFT[persona.tone],
                      )}
                    >
                      <Icon className="size-5" strokeWidth={1.75} />
                    </span>
                    <blockquote className="flex-1 text-base leading-relaxed text-pretty text-brand-ink">
                      {persona.line}
                    </blockquote>
                    <figcaption className="border-t border-brand-line/70 pt-4">
                      <p className="text-sm font-medium text-brand-ink">{persona.who}</p>
                      <p className="text-xs text-brand-ink-subtle">{persona.role}</p>
                    </figcaption>
                  </figure>
                </GlowCard>
              </FadeUp>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
