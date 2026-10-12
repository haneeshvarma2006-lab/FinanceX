import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Download } from 'lucide-react';
import { isCurrency } from '@nestedflow/domain/money';
import { requireUser } from '@/lib/auth/current-user';
import { Card, CardBody } from '@/components/ui/card';
import { Money } from '@/components/ui/money';
import * as repo from '@/modules/finance/repository';
import { DeleteBill } from './delete-bill';

export const metadata: Metadata = { title: 'Bill' };

/** One bill photo, full size, with the expense it belongs to. */
export default async function BillPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const bill = await repo.findBill(user.id, id);
  if (!bill) notFound();
  const tx = bill.transactionId
    ? await repo.findTransaction(user.id, bill.transactionId)
    : undefined;
  const locale = user.locale || 'en-IN';
  const day = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/finance/bills"
        className="inline-flex items-center gap-1.5 self-start text-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft aria-hidden className="size-4" />
        All bills
      </Link>

      <div>
        <h1 className="ui-ink text-3xl font-semibold tracking-tighter sm:text-4xl">
          {bill.merchant ?? 'Bill'}
        </h1>
        <p className="numeric mt-1 text-sm text-text-secondary">
          {bill.billDate ? day.format(new Date(`${bill.billDate}T12:00:00Z`)) : ''}
          {bill.amountMinor !== null && bill.currency && isCurrency(bill.currency) && (
            <>
              {' · '}
              <Money minor={bill.amountMinor} currency={bill.currency} locale={locale} />
            </>
          )}
        </p>
        <p className="mt-1 text-xs text-text-muted">
          {tx
            ? `Attached to the expense “${tx.description}” on ${tx.occurredOn}.`
            : 'Not attached to an expense — the one it belonged to was deleted.'}
        </p>
      </div>

      <Card>
        <CardBody className="p-2 sm:p-3">
          {/* Served through the app after an ownership check; not optimisable by next/image. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/bills/${bill.id}`}
            alt={`Bill${bill.merchant ? ` from ${bill.merchant}` : ''}`}
            className="mx-auto max-h-[85dvh] w-auto rounded-lg object-contain"
          />
        </CardBody>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <a
          href={`/api/bills/${bill.id}?download=1`}
          className="inline-flex h-9.5 items-center gap-2 rounded-[var(--radius-control)] border border-border-subtle bg-surface-overlay px-4 text-sm text-text-primary shadow-(--shadow-edge) hover:border-border-strong"
        >
          <Download aria-hidden className="size-4" />
          Download
        </a>
        <DeleteBill id={bill.id} />
      </div>
    </div>
  );
}
