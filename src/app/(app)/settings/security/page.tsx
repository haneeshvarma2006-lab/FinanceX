import type { Metadata } from 'next';
import { Monitor } from 'lucide-react';
import { requireUser } from '@/lib/auth/current-user';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import { Badge } from '@/components/ui/money';
import * as repo from '@/modules/identity/repository';
import { isGoogleConfigured } from '@/modules/identity/oauth';
import { RevokeSessionButton, RevokeOthersButton, UnlinkButton } from './controls';

export const metadata: Metadata = { title: 'Security' };

/** Shorten a user agent enough to recognise a device without parsing it. */
function describeAgent(agent: string | null): string {
  if (!agent) return 'Unknown device';
  if (/android/i.test(agent)) return 'Android device';
  if (/iphone|ipad/i.test(agent)) return 'iOS device';
  if (/macintosh/i.test(agent)) return 'Mac';
  if (/windows/i.test(agent)) return 'Windows PC';
  if (/linux/i.test(agent)) return 'Linux device';
  return 'Browser';
}

export default async function SecuritySettingsPage() {
  const user = await requireUser();

  const [sessions, linked] = await Promise.all([
    repo.listSessionsForUser(user.id, new Date()),
    repo.listOAuthAccountsForUser(user.id),
  ]);

  const hasPassword = user.passwordHash !== repo.NO_PASSWORD;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title="Where you are signed in"
          description="Every active session on your account. Signing one out takes effect immediately."
          action={sessions.length > 1 ? <RevokeOthersButton /> : undefined}
        />
        <CardBody className="p-0">
          {sessions.length === 0 ? (
            <EmptyState
              title="No active sessions"
              description="That is unexpected while you are reading this page — try reloading."
              icon={<Monitor aria-hidden className="size-5" />}
            />
          ) : (
            <ul className="divide-y divide-border-subtle">
              {sessions.map((session) => (
                <li
                  key={session.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-text-primary">{describeAgent(session.userAgent)}</p>
                    <p className="numeric mt-0.5 text-xs text-text-muted">
                      Started {session.createdAt.toISOString().slice(0, 16).replace('T', ' ')} UTC
                      {session.ip ? ` · ${session.ip}` : ''}
                    </p>
                  </div>
                  <RevokeSessionButton sessionId={session.id} />
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Connected accounts"
          description="External sign-in methods linked to this account."
        />
        <CardBody className="p-0">
          {linked.length === 0 ? (
            <EmptyState
              title="Nothing connected"
              description={
                isGoogleConfigured()
                  ? 'You can connect a Google account to sign in with one click.'
                  : 'Google sign-in is not configured on this deployment, so there is nothing to connect yet.'
              }
            />
          ) : (
            <ul className="divide-y divide-border-subtle">
              {linked.map((account) => (
                <li
                  key={account.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm capitalize text-text-primary">{account.provider}</p>
                    <p className="mt-0.5 truncate text-xs text-text-muted">
                      {account.providerEmail ?? 'Linked account'}
                    </p>
                  </div>
                  <UnlinkButton
                    accountId={account.id}
                    // Removing the only way in would lock the account.
                    disabled={!hasPassword && linked.length === 1}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Sign-in method" />
        <CardBody className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-secondary">Password</span>
            {hasPassword ? (
              <Badge tone="positive">Set</Badge>
            ) : (
              <Badge tone="warning">Not set</Badge>
            )}
          </div>
          <p className="text-sm text-pretty text-text-secondary">
            Password reset by email is not available on this deployment — no email provider is
            configured, and a reset flow that cannot deliver mail would be security theatre rather
            than a feature. Keep your password somewhere safe.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
