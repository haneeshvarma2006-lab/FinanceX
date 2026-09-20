import Link from 'next/link';
import { PageHeader } from '@/components/ui/money';

const TABS = [
  { href: '/settings', label: 'Profile' },
  { href: '/settings/email', label: 'Email' },
  { href: '/settings/security', label: 'Security' },
  { href: '/settings/privacy', label: 'Privacy & data' },
] as const;

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <PageHeader title="Settings" description="Your account, your data, your choices." />

      <nav aria-label="Settings sections" className="mb-6 border-b border-border-subtle">
        <ul className="-mb-px flex flex-wrap gap-1">
          {TABS.map((tab) => (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className="inline-block border-b-2 border-transparent px-3 py-2 text-sm text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
              >
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {children}
    </div>
  );
}
