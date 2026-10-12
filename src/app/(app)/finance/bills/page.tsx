import type { Metadata } from 'next';
import Link from 'next/link';
import { Receipt, ScanLine } from 'lucide-react';
import { isCurrency } from '@nestedflow/domain/money';
import { requireUser } from '@/lib/auth/current-user';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Money, PageHeader } from '@/components/ui/money';
import { EmptyState } from '@/components/ui/states';
import { billPhotosEnabled } from '@/modules/finance/bills';
import * as repo from '@/modules/finance/repository';

export const metadata: Metadata = { title: 'Bills' };

/** Every kept bill photo, newest first, by month. */
export default async function BillsPage() {
  const user = await requireUser();
  const bills = await repo.listBills(user.id);
  const enabled = billPhotosEnabled();
  const locale = user.locale || 'en-IN';

  const monthOf = new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const dayOf = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
  const months = new Map<string, typeof bills>();
  for (const bill of bills) {
    const key = (bill.billDate ?? bill.createdAt.toISOString().slice(0, 10)).slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), bill]);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Money"
        accent="finance"
        title="Bills"
        description="Photos of your bills, kept privately with the expenses they belong to. Only you can open them."
        action={
          <Link
            href="/finance/scan"
            className="inline-flex h-9.5 items-center gap-2 rounded-full bg-text-primary px-4 text-sm font-medium text-surface-sunken shadow-(--shadow-raised)"
          >
            <ScanLine aria-hidden className="size-4" />
            Scan a bill
          </Link>
        }
      />

      {bills.length === 0 ? (
        <Card accent="finance">
          <EmptyState
            icon={<Receipt aria-hidden className="size-5" />}
            title="No bills kept yet"
            description={
              enabled
                ? 'Scan a bill and keep its photo: it lands here, attached to its expense.'
                : 'Bill photos are not switched on for this site yet. Scanning still records the expense.'
            }
          />
        </Card>
      ) : (
        [...months].map(([key, items]) => (
          <section key={key} aria-labelledby={`bills-${key}`}>
            <Card accent="finance">
              <CardHeader
                id={`bills-${key}`}
                title={monthOf.format(new Date(`${key}-15T12:00:00Z`))}
                description={`${items.length} bill${items.length === 1 ? '' : 's'}`}
              />
              <CardBody>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {items.map((bill) => (
                    <li key={bill.id}>
                      <Link
                        href={`/finance/bills/${bill.id}`}
                        className="group flex flex-col overflow-hidden rounded-xl border border-border-subtle bg-surface-inset/50 transition-colors hover:border-border-strong"
                      >
                        {/* Served through the app after an ownership check; not optimisable by next/image. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/bills/${bill.id}`}
                          alt={`Bill${bill.merchant ? ` from ${bill.merchant}` : ''}`}
                          loading="lazy"
                          className="aspect-[3/4] w-full object-cover object-top"
                        />
                        <span className="flex flex-col gap-0.5 px-3 py-2">
                          <span className="truncate text-sm text-text-primary">
                            {bill.merchant ?? 'Bill'}
                          </span>
                          <span className="numeric text-xs text-text-muted">
                            {bill.billDate
                              ? dayOf.format(new Date(`${bill.billDate}T12:00:00Z`))
                              : ''}
                            {bill.amountMinor !== null &&
                              bill.currency &&
                              isCurrency(bill.currency) && (
                                <>
                                  {' · '}
                                  <Money
                                    minor={bill.amountMinor}
                                    currency={bill.currency}
                                    locale={locale}
                                  />
                                </>
                              )}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          </section>
        ))
      )}
    </div>
  );
}
