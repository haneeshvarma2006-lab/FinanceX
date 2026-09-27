import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
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
 * pointer-following glow run in the browser. Someone already signed in is
 * taken to their dashboard, since the pitch is for people who have not yet
 * started.
 */
export default async function LandingPage() {
  if (await getCurrentUser()) redirect('/today');

  return (
    <div
      className={cn(
        'min-h-dvh bg-brand-canvas font-display text-brand-ink antialiased',
        'selection:bg-brand-tasks/30',
      )}
    >
      <MotionRoot>
        <SiteNav />
        <main id="main">
          <Hero />
          <FeatureBento />
          <ConnectedFlows />
          <Analytics />
          <Audience />
          <FinalCta />
        </main>
        <SiteFooter />
      </MotionRoot>
    </div>
  );
}
