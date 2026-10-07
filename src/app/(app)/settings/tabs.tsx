import { SegmentTabs } from '@/components/ui/segment-tabs';

const TABS = [
  { href: '/settings', label: 'Profile' },
  { href: '/settings/email', label: 'Email' },
  { href: '/settings/security', label: 'Security' },
  { href: '/settings/privacy', label: 'Privacy & data' },
] as const;

export function SettingsTabs() {
  return (
    <div className="mb-6">
      <SegmentTabs tabs={TABS} label="Settings sections" pillId="settings-tab" />
    </div>
  );
}
