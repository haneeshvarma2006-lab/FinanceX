import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/current-user';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import * as emailRepo from '@/modules/email/repository';
import { EMAIL_CATEGORIES, EMAIL_CATEGORY_KEYS } from '@/modules/email/categories';
import { PreferenceToggle } from './toggle';
import { brand } from '@/lib/brand';

export const metadata: Metadata = { title: 'Email preferences' };

/** The preference centre. Every optional category can be switched off here. */
export default async function EmailSettingsPage() {
  const user = await requireUser();
  const stored = await emailRepo.listPreferences(user.id);
  const by = new Map(stored.map((p) => [p.category, p.subscribed]));

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title="Email preferences"
          description={`Choose what ${brand.name} may send you. Changes take effect immediately.`}
        />
        <CardBody className="p-0">
          <ul className="divide-y divide-border-subtle">
            {EMAIL_CATEGORY_KEYS.map((key) => {
              const category = EMAIL_CATEGORIES[key];
              return (
                <li key={key} className="px-5 py-4">
                  <PreferenceToggle
                    category={key}
                    label={category.label}
                    description={category.description}
                    optional={category.optional}
                    subscribed={by.get(key) ?? !category.transactional === false}
                  />
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="How unsubscribing works" />
        <CardBody>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-pretty text-text-secondary">
            <li>
              Every optional email carries an unsubscribe link and a{' '}
              <code className="text-text-primary">List-Unsubscribe</code> header, so mail clients
              that support one-click unsubscribe can offer it.
            </li>
            <li>
              Whether your mail client shows its own unsubscribe button is decided by that client,
              not by {brand.name}. We supply the header; Gmail and others decide how to present it.
            </li>
            <li>
              Unsubscribing from one category never changes the others, and essential account email
              continues while your account is open.
            </li>
            <li>
              No email provider is configured on this deployment, so nothing is being sent at
              present. These preferences are still recorded and honoured.
            </li>
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
