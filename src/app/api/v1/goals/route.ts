import { authenticated, readBody } from '@/lib/api/handler';
import { ok } from '@/lib/result';
import * as repo from '@/modules/productivity/repository';
import * as productivity from '@/modules/productivity/service';
import { goalSchema } from '@/modules/productivity/validators';
import { todayFor } from '@/modules/dashboard/service';

export const GET = authenticated(async ({ user }) => {
  const today = todayFor(user.timezone);
  const goals = await repo.listGoals(user.id);

  // Progress, pacing and labels from the shared computation.
  return ok(goals.map((goal) => productivity.describeProgress(goal, today)));
});

export const POST = authenticated(async ({ user, request }) => {
  const body = await readBody(request, goalSchema);
  if (!body.ok) return body;

  return productivity.createGoal(user.id, body.value);
});
