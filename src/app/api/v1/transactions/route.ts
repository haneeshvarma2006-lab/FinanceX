import { authenticated, readBody } from '@/lib/api/handler';
import { ok } from '@/lib/result';
import { paginate, paginationSchema } from '@/lib/query';
import * as repo from '@/modules/finance/repository';
import * as finance from '@/modules/finance/service';
import { transactionSchema } from '@/modules/finance/validators';

export const GET = authenticated(async ({ user, request }) => {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const pagination = paginationSchema.parse(params);

  const filter = {
    ...(params.account ? { accountId: params.account } : {}),
    ...(params.from ? { from: params.from } : {}),
    ...(params.to ? { to: params.to } : {}),
  };

  const [items, total] = await Promise.all([
    repo.listTransactions(user.id, {
      ...filter,
      limit: pagination.pageSize,
      offset: (pagination.page - 1) * pagination.pageSize,
    }),
    repo.countTransactions(user.id, filter),
  ]);

  return ok(paginate(items, total, pagination));
});

/**
 * Expense capture — the highest-value mobile write.
 *
 * Amount arrives as a string and is parsed into integer minor units by the
 * service, exactly as on the web. It never passes through a float on either
 * side of the wire.
 */
export const POST = authenticated(async ({ user, request }) => {
  const body = await readBody(request, transactionSchema);
  if (!body.ok) return body;

  return finance.createTransaction(user.id, body.value);
});
