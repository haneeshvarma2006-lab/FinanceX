import { SegmentTabs } from '@/components/ui/segment-tabs';

const TABS = [
  { href: '/trading', label: 'Journal' },
  { href: '/trading/markets', label: 'Live markets' },
] as const;

export function TradingTabs() {
  return <SegmentTabs tabs={TABS} label="Trading sections" pillId="trading-tab" />;
}
