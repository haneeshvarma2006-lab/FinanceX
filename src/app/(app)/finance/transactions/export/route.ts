import { getCurrentUser } from '@/lib/auth/current-user';
import * as repo from '@/modules/finance/repository';
import { ledgerFilter, ledgerParamsSchema, toCsv } from '@/modules/finance/ledger';

/**
 * The ledger as a CSV file, filtered exactly as the page is: for a
 * spreadsheet, a tax return or an accountant. Only the signed-in person's
 * own transactions, never cached by anything shared.
 */
export const dynamic = 'force-dynamic';

const MAX_ROWS = 20_000;

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return new Response('Not signed in', { status: 401 });

  const params = ledgerParamsSchema.parse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  const filter = ledgerFilter(params);
  const [rows, accounts, categories] = await Promise.all([
    repo.searchLedger(user.id, filter, MAX_ROWS),
    repo.listAccounts(user.id, true),
    repo.listCategories(user.id),
  ]);
  const account = new Map(accounts.map((a) => [a.id, a.name]));
  const category = new Map(categories.map((c) => [c.id, c.name]));

  const csv = toCsv(
    rows.map((t) => ({
      occurredOn: t.occurredOn,
      description: t.description,
      category: t.categoryId ? (category.get(t.categoryId) ?? null) : null,
      account: account.get(t.accountId) ?? '',
      kind: t.kind,
      amountMinor: t.amountMinor,
      currency: t.currency,
      notes: t.notes,
    })),
  );
  const name = `transactions${params.month ? `-${params.month}` : ''}.csv`;
  // A byte-order mark, so Excel reads ₹ and names in any script correctly.
  return new Response(`﻿${csv}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
