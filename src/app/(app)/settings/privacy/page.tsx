import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth/current-user';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import * as repo from '@/modules/identity/repository';
import { DeleteAccountForm } from './delete-form';

export const metadata: Metadata = { title: 'Privacy & data' };

export default async function PrivacySettingsPage() {
  const user = await requireUser();
  const consents = await repo.listConsents(user.id);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title="What KyliX stores"
          description="Plainly, so you can decide whether you are comfortable with it."
        />
        <CardBody>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-pretty text-text-secondary">
            <li>Your name, email address, time zone and base currency.</li>
            <li>Your date of birth, used only for the age check at sign-up and not shared.</li>
            <li>
              Everything you enter: accounts, transactions, budgets, trades and notes. All of it is
              entered by you — KyliX connects to no bank, broker or data provider.
            </li>
            <li>
              A security log of sign-ins, sign-outs and account changes, with the IP address and
              browser, so you can spot access you did not expect.
            </li>
            <li>
              A record of what you consented to and when, including the version of the document you
              agreed to.
            </li>
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Your consents" description="What you have agreed to, and when." />
        <CardBody className="p-0">
          <ul className="divide-y divide-border-subtle">
            {consents.length === 0 && (
              <li className="px-5 py-4 text-sm text-text-muted">Nothing recorded.</li>
            )}
            {consents.map((consent) => (
              <li
                key={consent.id}
                className="flex flex-wrap items-center justify-between gap-2 px-5 py-3"
              >
                <span className="text-sm text-text-primary">{consent.kind.replace(/_/g, ' ')}</span>
                <span className="numeric text-xs text-text-muted">
                  v{consent.documentVersion} ·{' '}
                  {consent.revokedAt
                    ? `withdrawn ${consent.revokedAt.toISOString().slice(0, 10)}`
                    : `given ${consent.grantedAt.toISOString().slice(0, 10)}`}
                </span>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Export your data"
          description="Everything KyliX holds about you, as JSON."
        />
        <CardBody className="flex flex-col gap-3">
          <p className="text-sm text-pretty text-text-secondary">
            The export contains your profile, financial records, trades and notes. It does not
            contain your password, which is stored only as an irreversible hash.
          </p>
          <div>
            <a
              href="/api/account/export"
              download
              className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] border border-border-subtle bg-surface-overlay px-4 py-2.5 text-sm text-text-primary transition-colors hover:border-border-strong"
            >
              Download export
            </a>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Notices" />
        <CardBody className="flex flex-col gap-2 text-sm text-text-secondary">
          <Link href="/legal/privacy" className="text-accent hover:underline">
            Privacy notice
          </Link>
          <Link href="/legal/terms" className="text-accent hover:underline">
            Terms of use
          </Link>
        </CardBody>
      </Card>

      <Card className="border-negative/30">
        <CardHeader
          title="Delete your account"
          description="Permanent. Everything above is removed and cannot be recovered."
        />
        <CardBody>
          <DeleteAccountForm hasPassword={user.passwordHash !== repo.NO_PASSWORD} />
        </CardBody>
      </Card>
    </div>
  );
}
