import type { Metadata } from 'next';
import { ScanLine } from 'lucide-react';
import { requireUser } from '@/lib/auth/current-user';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/money';
import { todayFor } from '@/modules/dashboard/service';
import * as repo from '@/modules/finance/repository';
import { BillScanner } from './scanner';

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
        title="Scan a bill"
        description="Photograph a bill and it becomes an expense: the total, the date and the shop are read on your phone, and you check them before anything is saved."
      />
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
          />
        </CardBody>
      </Card>
    </div>
  );
}
