import type { Metadata } from 'next';
import { Activity } from 'lucide-react';
import { requireUser } from '@/lib/auth/current-user';
import { marketProvider } from '@/modules/markets/service';
import { listAlerts } from '@/modules/markets/repository';
import { PageHeader } from '@/components/ui/money';
import { TradingTabs } from '../tabs';
import { LiveMarkets } from './live-markets';

export const metadata: Metadata = { title: 'Live markets' };

export default async function MarketsPage() {
  const user = await requireUser();
  const provider = marketProvider();
  const alerts = await listAlerts(user.id);

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
        provider={provider?.label ?? null}
        intervalSeconds={provider?.refreshSeconds ?? 60}
        locale={user.locale || 'en-IN'}
        alerts={alerts.map((a) => ({
          id: a.id,
          instrumentId: a.instrumentId,
          direction: a.direction === 'below' ? 'below' : 'above',
          target: a.target,
          active: a.active,
          firedAt: a.firedAt?.toISOString() ?? null,
          firedPrice: a.firedPrice,
        }))}
      />
    </div>
  );
}
