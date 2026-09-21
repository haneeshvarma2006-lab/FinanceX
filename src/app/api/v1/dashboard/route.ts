import { authenticated } from '@/lib/api/handler';
import { ok } from '@/lib/result';
import { buildTodaySnapshot, runAutomationRules } from '@/modules/dashboard/service';

/**
 * The same snapshot the web dashboard renders, from the same service.
 *
 * Rules are evaluated here too, so a user who only ever opens the phone still
 * gets their automations — the dashboard read is what drives them on both
 * clients.
 */
export const GET = authenticated(async ({ user }) => {
  const snapshot = await buildTodaySnapshot(user.id, user.timezone, user.baseCurrency);
  await runAutomationRules(user.id, snapshot);

  return ok(snapshot);
});
