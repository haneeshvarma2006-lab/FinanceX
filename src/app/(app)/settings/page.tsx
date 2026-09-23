import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/current-user';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/money';
import { brand } from '@/lib/brand';

export const metadata: Metadata = { title: 'Profile' };

export default async function ProfileSettingsPage() {
  const user = await requireUser();

  const rows: { label: string; value: React.ReactNode }[] = [
    { label: 'Name', value: user.displayName },
    {
      label: 'Email',
      value: (
        <span className="flex items-center gap-2">
          {user.email}
          {user.emailVerifiedAt ? (
            <Badge tone="positive">Verified</Badge>
          ) : (
            <Badge tone="warning">Unverified</Badge>
          )}
        </span>
      ),
    },
    { label: 'Base currency', value: user.baseCurrency },
    { label: 'Time zone', value: user.timezone },
    {
      label: 'Account created',
      value: user.createdAt.toISOString().slice(0, 10),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader title="Your profile" description={`What ${brand.name} knows about you.`} />
        <CardBody className="p-0">
          <dl className="divide-y divide-border-subtle">
            {rows.map((row) => (
              <div
                key={row.label}
                className="flex flex-wrap items-center justify-between gap-2 px-5 py-3"
              >
                <dt className="text-sm text-text-secondary">{row.label}</dt>
                <dd className="text-sm text-text-primary">{row.value}</dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>

      {!user.emailVerifiedAt && (
        <Card>
          <CardHeader title="Email verification" />
          <CardBody>
            <p className="text-sm text-pretty text-text-secondary">
              Your address is not verified yet. Verification needs an email provider, and none is
              configured on this deployment — so no verification message can be sent. Until one is
              set up, marketing email is withheld from unverified addresses rather than sent anyway.
            </p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
