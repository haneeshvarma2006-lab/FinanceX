import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/current-user';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import * as repo from '@/modules/productivity/repository';
import { NOTIFICATION_KINDS, NOTIFICATION_KIND_KEYS } from '@/modules/productivity/notifications';
import { NotificationToggle } from './toggle';

export const metadata: Metadata = { title: 'Notification preferences' };

export default async function NotificationSettingsPage() {
  const user = await requireUser();
  const stored = await repo.listNotificationPreferences(user.id);
  const by = new Map(stored.map((p) => [p.kind, p.enabled]));

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title="In-app notifications"
          description="Raised from your own records. Turning one off stops it being created at all, not just hidden."
        />
        <CardBody className="p-0">
          <ul className="divide-y divide-border-subtle">
            {NOTIFICATION_KIND_KEYS.map((kind) => (
              <li key={kind} className="px-5 py-4">
                <NotificationToggle
                  kind={kind}
                  label={NOTIFICATION_KINDS[kind].label}
                  description={NOTIFICATION_KINDS[kind].description}
                  // Absent means never configured; the default is on.
                  enabled={by.get(kind) ?? true}
                />
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Email" />
        <CardBody>
          <p className="text-sm text-pretty text-text-secondary">
            These settings control in-app notifications only. Email preferences are separate, and no
            email provider is configured on this deployment — nothing is being sent.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
