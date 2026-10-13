import type { Metadata } from 'next';
import Link from 'next/link';
import { FileUp, Wallet } from 'lucide-react';
import { requireUser } from '@/lib/auth/current-user';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/money';
import { EmptyState } from '@/components/ui/states';
import * as repo from '@/modules/finance/repository';
import { ImportWizard } from './wizard';

export const metadata: Metadata = { title: 'Import a statement' };

export default async function ImportPage() {
  const user = await requireUser();
  const accounts = await repo.listAccounts(user.id);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Money"
        accent="finance"
        icon={<FileUp />}
        title="Import a statement"
        description="Add the CSV statement from your bank's website. It's read in your browser, with no bank login, ever."
      />

      {accounts.length === 0 ? (
        <Card accent="finance">
          <EmptyState
            icon={<Wallet aria-hidden className="size-5" />}
            title="Add the account first"
            description="A statement is imported into one of your accounts, in its currency."
            action={
              <Link
                href="/finance"
                className="text-sm font-medium text-text-primary underline-offset-4 hover:underline"
              >
                Go to Finance
              </Link>
            }
          />
        </Card>
      ) : (
        <Card accent="finance">
          <CardHeader
            title="Statement"
            accent="finance"
            icon={<FileUp className="size-4" />}
            description="CSV only. Excel users: File → Save As → CSV."
          />
          <CardBody>
            <ImportWizard
              accounts={accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
              locale={user.locale || 'en-IN'}
            />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
