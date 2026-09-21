import { authenticated } from '@/lib/api/handler';
import { notFound } from '@/lib/result';
import * as productivity from '@/modules/productivity/service';

/**
 * Completing a task also materialises the next occurrence when it recurs —
 * handled by the service, so the phone and the web produce identical results.
 */
export const POST = authenticated(async ({ user, params }) => {
  const id = params.id;
  if (!id) return notFound();

  return productivity.completeTask(user.id, id);
});
