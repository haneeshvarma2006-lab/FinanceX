import type { Metadata } from 'next';
import { Activity } from 'lucide-react';
import { requireUser } from '@/lib/auth/current-user';
import { getEnv } from '@/lib/env';
import { PageHeader } from '@/components/ui/money';
import { TradingTabs } from '../tabs';
import { LiveMarkets } from './live-markets';

export const metadata: Metadata = { title: 'Live markets' };

export default async function MarketsPage() {
  const user = await requireUser();
  const env = getEnv();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Markets"
        accent="trading"
        icon={<Activity />}
        title="Live markets"
        description="Crypto ticking live, plus gold, forex and stocks. Prices to watch, not to trade on here."
      />
      <TradingTabs />
      <LiveMarkets
        keyedEnabled={Boolean(env.TWELVE_DATA_API_KEY)}
        intervalSeconds={env.MARKET_POLL_SECONDS}
        locale={user.locale || 'en-IN'}
      />
    </div>
  );
}
