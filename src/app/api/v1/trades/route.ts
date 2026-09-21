import { authenticated, readBody } from '@/lib/api/handler';
import { ok } from '@/lib/result';
import { paginate, paginationSchema } from '@/lib/query';
import * as repo from '@/modules/trading/repository';
import * as trading from '@/modules/trading/service';
import { tradeSchema } from '@/modules/trading/validators';

export const GET = authenticated(async ({ user, request }) => {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const pagination = paginationSchema.parse(params);

  const filter = {
    ...(params.account ? { tradingAccountId: params.account } : {}),
    ...(params.status ? { status: params.status } : {}),
    ...(params.symbol ? { symbol: params.symbol.toUpperCase() } : {}),
  };

  const items = await repo.listTrades(user.id, {
    ...filter,
    limit: pagination.pageSize,
    offset: (pagination.page - 1) * pagination.pageSize,
  });

  return ok(paginate(items, items.length, pagination));
});

export const POST = authenticated(async ({ user, request }) => {
  const body = await readBody(request, tradeSchema);
  if (!body.ok) return body;

  return trading.createTrade(user.id, body.value);
});
