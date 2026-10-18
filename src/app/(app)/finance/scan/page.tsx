import type { Metadata } from 'next';
import { ScanLine } from 'lucide-react';
import { requireUser } from '@/lib/auth/current-user';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/money';
import { EmptyState } from '@/components/ui/states';
import type { Currency } from '@nestedflow/domain/money';
import { todayFor } from '@/modules/dashboard/service';
import { billPhotosEnabled } from '@/modules/finance/bills';
import * as repo from '@/modules/finance/repository';
import { BillScanner } from './scanner';
import { Sheet } from '@/components/ui/sheet';
import { AddAccountForm } from '../forms';

export const metadata: Metadata = { title: 'Scan a bill' };

export default async function ScanBillPage() {
  const user = await requireUser();
  const [accounts, categories] = await Promise.all([
    repo.listAccounts(user.id),
    repo.listCategories(user.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Money"
        accent="finance"
        icon={<ScanLine />}
        title="Scan a bill"
        description="Snap a bill. The total, date and shop are read on your phone; you check them and it's added."
      />
      {accounts.length === 0 ? (
        // A bill becomes an expense from one of your accounts, so the first
        // one is made right here rather than by sending you elsewhere.
        <Card accent="finance">
          <EmptyState
            icon={<ScanLine aria-hidden className="size-5" />}
            title="First, where did the money come from?"
            description="Add the account you pay from: cash, a bank account or a card. Then the camera opens."
            action={
              <Sheet label="New account" description="Cash, a bank account or a card." defaultOpen>
                <AddAccountForm defaultCurrency={user.baseCurrency as Currency} />
              </Sheet>
            }
          />
        </Card>
      ) : (
        <Card accent="finance">
          <CardHeader
            title="Bill"
            accent="finance"
            icon={<ScanLine className="size-4" />}
            description="Printed bills read best: flat, well lit, the whole bill in frame."
          />
          <CardBody>
            <BillScanner
              accounts={accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
              categories={categories
                .filter((c) => c.kind === 'expense')
                .map((c) => ({ id: c.id, name: c.name }))}
              today={todayFor(user.timezone)}
              canKeepPhotos={billPhotosEnabled()}
            />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
