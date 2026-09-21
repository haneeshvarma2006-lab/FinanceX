import { z } from 'zod';
import { authenticated, readBody } from '@/lib/api/handler';
import { notFound, ok } from '@/lib/result';
import * as productivity from '@/modules/productivity/service';
import { todayFor } from '@/modules/dashboard/service';

const bodySchema = z.object({
  /** Defaults to the user's today; supplied explicitly when backfilling. */
  onDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  count: z.coerce.number().int().min(1).max(50).default(1),
});

/** Idempotent by (habit, date): logging twice does not count twice. */
export const POST = authenticated(async ({ user, request, params }) => {
  const id = params.id;
  if (!id) return notFound();

  const body = await readBody(request, bodySchema);
  if (!body.ok) return body;

  const result = await productivity.logHabit(user.id, {
    habitId: id,
    onDate: body.value.onDate ?? todayFor(user.timezone),
    count: body.value.count,
  });

  return result.ok ? ok({ logged: true }) : result;
});

export const DELETE = authenticated(async ({ user, request, params }) => {
  const id = params.id;
  if (!id) return notFound();

  const onDate = new URL(request.url).searchParams.get('onDate') ?? todayFor(user.timezone);
  const result = await productivity.unlogHabit(user.id, id, onDate);

  return result.ok ? ok({ logged: false }) : result;
});
