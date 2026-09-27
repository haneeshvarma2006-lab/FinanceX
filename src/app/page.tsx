import type { Metadata } from 'next';
import { getCurrentUser } from '@/lib/auth/current-user';
import { brand } from '@/lib/brand';
import { cn } from '@/lib/cn';
import { Analytics } from '@/components/landing/analytics';
import { Audience } from '@/components/landing/audience';
import { ConnectedFlows } from '@/components/landing/connected-flows';
import { FeatureBento } from '@/components/landing/feature-bento';
import { FinalCta } from '@/components/landing/final-cta';
import { Hero } from '@/components/landing/hero';
import { MotionRoot } from '@/components/landing/motion';
import { SiteFooter } from '@/components/landing/site-footer';
import { SiteNav } from '@/components/landing/site-nav';

export const metadata: Metadata = {
  title: { absolute: `${brand.name} — ${brand.tagline}` },
  description: brand.description,
};

/**
 * The marketing page.
 *
 * Sections are server components; only the motion wrappers and the
 * pointer-following glow run in the browser. It shows to everyone — signed
 * in or not — so the front door is always the same; a signed-in visitor just
 * gets "Open app" where everyone else gets the sign-up buttons.
 */
export default async function LandingPage() {
  const signedIn = Boolean(await getCurrentUser());

  return (
    <div
      className={cn(
        'min-h-dvh bg-brand-canvas font-display text-brand-ink antialiased',
        'selection:bg-brand-tasks/30',
      )}
    >
      <MotionRoot>
        <SiteNav signedIn={signedIn} />
        <main id="main">
          <Hero signedIn={signedIn} />
          <FeatureBento />
          <ConnectedFlows />
          <Analytics />
          <Audience />
          <FinalCta signedIn={signedIn} />
        </main>
        <SiteFooter signedIn={signedIn} />
      </MotionRoot>
    </div>
  );
}
