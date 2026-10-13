import { Settings } from 'lucide-react';
import { PageHeader } from '@/components/ui/money';
import { SettingsTabs } from './tabs';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <PageHeader
        eyebrow="Account"
        icon={<Settings />}
        title="Settings"
        description="Your account, your data, your choices."
      />

      <SettingsTabs />

      {children}
    </div>
  );
}
