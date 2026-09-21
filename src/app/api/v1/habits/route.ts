import { authenticated, readBody } from '@/lib/api/handler';
import { ok } from '@/lib/result';
import * as productivity from '@/modules/productivity/service';
import { habitSchema } from '@/modules/productivity/validators';
import { todayFor } from '@/modules/dashboard/service';

export const GET = authenticated(async ({ user }) =>
  // Streaks come from the shared computation, not a second implementation.
  ok(await productivity.habitsWithStreaks(user.id, todayFor(user.timezone))),
);

export const POST = authenticated(async ({ user, request }) => {
  const body = await readBody(request, habitSchema);
  if (!body.ok) return body;

  return productivity.createHabit(user.id, body.value);
});
