import type { Metadata } from 'next';
import { FileUp, Wallet } from 'lucide-react';
import { requireUser } from '@/lib/auth/current-user';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/money';
import { Sheet } from '@/components/ui/sheet';
import { AddAccountForm } from '../forms';
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
            title="First, which account is this statement for?"
            description="Add it here: the bank account or card the statement comes from."
            action={
              <Sheet
                label="New account"
                description="The bank account or card this statement is from."
              >
                <AddAccountForm defaultCurrency={user.baseCurrency} />
              </Sheet>
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
