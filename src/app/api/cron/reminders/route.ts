import { NextResponse } from 'next/server';
import { getEnv } from '@/lib/env';
import { safeEquals } from '@/lib/security/tokens';
import { todayFor } from '@/modules/dashboard/service';
import * as identityRepo from '@/modules/identity/repository';
import { remindDueBills, usersWithBillsDueBy } from '@/modules/finance/service';

/**
 * The daily reminders job: every bill due within three days gets its
 * notification and email, even for someone who has not opened the app.
 *
 * Vercel Cron calls it once a day (vercel.json) with the project's
 * CRON_SECRET as a bearer token. Without that secret configured it refuses
 * every call, so it can never be triggered by anyone on the internet.
 * Running it twice sends nothing twice: each reminder is once per due date.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = getEnv().CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Reminders are not set up' }, { status: 503 });
  }
  const given = request.headers.get('authorization') ?? '';
  if (!safeEquals(given, `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 401 });
  }

  // Four days ahead of UTC covers "due within three days" in every time zone.
  const horizon = new Date(Date.now() + 4 * 86_400_000).toISOString().slice(0, 10);
  const userIds = await usersWithBillsDueBy(horizon);

  let reminded = 0;
  for (const userId of userIds) {
    const user = await identityRepo.findUserById(userId);
    if (!user || user.deletedAt) continue;
    reminded += await remindDueBills(user.id, todayFor(user.timezone));
  }
  return NextResponse.json({ accounts: userIds.length, reminded });
}
