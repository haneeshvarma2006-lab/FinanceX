import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/current-user';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { canDeliverToUsers } from '@/modules/email/service';
import * as repo from '@/modules/productivity/repository';
import { NOTIFICATION_KINDS, NOTIFICATION_KIND_KEYS } from '@/modules/productivity/notifications';
import * as push from '@/modules/push/service';
import { DevicePush } from './device-push';
import { RemoveDevice } from './remove-device';
import { NotificationToggle } from './toggle';

export const metadata: Metadata = { title: 'Notification preferences' };

export default async function NotificationSettingsPage() {
  const user = await requireUser();
  const [stored, devices] = await Promise.all([
    repo.listNotificationPreferences(user.id),
    push.devices(user.id),
  ]);
  const by = new Map(stored.map((p) => [p.kind, p.enabled]));
  const day = new Intl.DateTimeFormat(user.locale || 'en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="flex flex-col gap-6">
      <Card labelledBy="device-card">
        <CardHeader
          id="device-card"
          title="NestedFlow on this phone"
          description="Install the app, and get reminders on your lock screen even when it is closed."
        />
        <DevicePush publicKey={push.publicKey()} knownEndpoints={devices.map((d) => d.endpoint)} />
        {devices.length > 0 && (
          <div className="border-t border-border-subtle px-5 py-4">
            <h3 className="text-xs font-medium tracking-wide text-text-muted uppercase">
              Devices with notifications on
            </h3>
            <ul className="mt-2 divide-y divide-border-subtle/70">
              {devices.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-text-primary">{d.label ?? 'A browser'}</p>
                    <p className="text-xs text-text-muted">
                      Since {day.format(d.createdAt)}
                      {d.lastSentAt ? ` · last notified ${day.format(d.lastSentAt)}` : ''}
                    </p>
                  </div>
                  <RemoveDevice id={d.id} label={d.label ?? 'this browser'} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          title="What you are notified about"
          description="Raised from your own records, in the app and on your devices. Turning one off stops it being created at all, not just hidden."
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
            {canDeliverToUsers()
              ? 'Email has its own settings, under Settings → Email: bill reminders and account emails are chosen there.'
              : 'Email is not set up on this deployment yet, so nothing is being sent by email. These settings cover the app and your devices.'}
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
