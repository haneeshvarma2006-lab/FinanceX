import type { Metadata } from 'next';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { requireUser } from '@/lib/auth/current-user';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import { PageHeader } from '@/components/ui/money';
import * as repo from '@/modules/productivity/repository';
import { MarkAllReadButton, MarkReadButton } from './views';

export const metadata: Metadata = { title: 'Notifications' };

export default async function NotificationsPage() {
  const user = await requireUser();

  const [items, unread] = await Promise.all([
    repo.listNotifications(user.id, { limit: 50 }),
    repo.countUnreadNotifications(user.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Notifications"
        description="Raised from your own data. Nothing is sent by email — no provider is configured."
        action={
          <Link href="/settings/notifications" className="text-sm text-accent hover:underline">
            Preferences
          </Link>
        }
      />

      <Card>
        <CardHeader
          title={unread > 0 ? `${unread} unread` : 'All caught up'}
          action={unread > 0 ? <MarkAllReadButton /> : undefined}
        />
        <CardBody className="p-0">
          {items.length === 0 ? (
            <EmptyState
              icon={<Bell aria-hidden className="size-5" />}
              title="Nothing yet"
              description="KyliX raises a notification when something in your own records changes state — a streak at risk, a budget passed, a run of losing trades."
            />
          ) : (
            <ul className="divide-y divide-border-subtle">
              {items.map((item) => (
                <li
                  key={item.id}
                  className={`flex flex-wrap items-start justify-between gap-3 px-5 py-4 ${
                    item.readAt ? 'opacity-60' : ''
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-text-primary">
                      {item.href ? (
                        <Link href={item.href as '/tasks'} className="hover:underline">
                          {item.title}
                        </Link>
                      ) : (
                        item.title
                      )}
                    </p>
                    {item.body && (
                      <p className="mt-0.5 text-xs text-pretty text-text-secondary">{item.body}</p>
                    )}
                    <p className="numeric mt-1 text-xs text-text-muted">
                      {item.createdAt.toISOString().slice(0, 16).replace('T', ' ')} UTC
                    </p>
                  </div>

                  {!item.readAt && <MarkReadButton id={item.id} />}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
