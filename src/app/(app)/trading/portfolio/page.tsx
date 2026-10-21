import type { Metadata } from 'next';
import { Briefcase } from 'lucide-react';
import { requireUser } from '@/lib/auth/current-user';
import { PageHeader } from '@/components/ui/money';
import { listHoldings } from '@/modules/markets/repository';
import { marketProvider } from '@/modules/markets/service';
import { TradingTabs } from '../tabs';
import { PortfolioView } from './portfolio-view';

export const metadata: Metadata = { title: 'Portfolio' };

export default async function PortfolioPage() {
  const user = await requireUser();
  const [holdings, provider] = await Promise.all([listHoldings(user.id), marketProvider()]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Markets"
        accent="trading"
        icon={<Briefcase />}
        title="Portfolio"
        description="What you hold, valued at live prices. Crypto moves every second; the rest with each refresh."
      />
      <TradingTabs />
      <PortfolioView
        holdings={holdings.map((h) => ({
          id: h.id,
          instrumentId: h.instrumentId,
          quantity: h.quantity,
          unit: h.unit === 'gram' || h.unit === 'ounce' ? h.unit : 'unit',
          averagePrice: h.averagePrice,
          note: h.note,
        }))}
        provider={provider?.label ?? null}
        intervalSeconds={provider?.refreshSeconds ?? 60}
        locale={user.locale || 'en-IN'}
        home={user.baseCurrency}
      />
    </div>
  );
}
