import { authenticated, readBody } from '@/lib/api/handler';
import { notFound } from '@/lib/result';
import * as trading from '@/modules/trading/service';
import { executionSchema } from '@/modules/trading/validators';

/**
 * Record a fill.
 *
 * Average entry, average exit and realised P&L are recomputed by the service
 * from the full execution list — the phone never calculates P&L itself, which
 * is the whole reason the domain logic stays in one place.
 */
export const POST = authenticated(async ({ user, request, params }) => {
  const id = params.id;
  if (!id) return notFound();

  const body = await readBody(request, executionSchema);
  if (!body.ok) return body;

  return trading.addExecution(user.id, id, body.value);
});
