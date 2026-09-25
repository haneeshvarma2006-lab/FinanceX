import { Client } from 'pg';

const DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  'postgresql://nestedflow:nestedflow@localhost:5432/nestedflow_e2e';

/**
 * Rate-limit counters are global by design, so without a reset between specs
 * each test spends the next one's budget and the suite fails on its own
 * throttling rather than on a real defect.
 */
export async function resetRateLimits(): Promise<void> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query('truncate table rate_limits');
  } finally {
    await client.end();
  }
}

/**
 * The task form keeps its refining fields — schedule, repeat, project — behind
 * a "More options" disclosure so capturing a task stays one field and one
 * click. Tests that set those fields open it first, as a user would.
 */
export async function openTaskOptions(page: import('@playwright/test').Page): Promise<void> {
  const details = page.locator('form details').first();
  const alreadyOpen = await details.evaluate((el) => (el as HTMLDetailsElement).open);
  if (!alreadyOpen) await details.locator('summary').click();
}

/**
 * A date `offsetDays` from today, as `YYYY-MM-DD`.
 *
 * Recurrence successors are computed from the clock at completion time, not
 * from the task's own scheduled date, so a test that pins an absolute date
 * passes only on that one day. Two of them rotted exactly that way.
 */
export function isoDay(offsetDays = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/**
 * Plant a password-reset token for an account, as if the reset email had been
 * sent and opened. The E2E server has no email provider, so this stands in for
 * the inbox; the request half of the flow is covered by the integration tests.
 * Returns the raw token, which is what the emailed link would carry.
 */
export async function plantResetToken(email: string, minutesValid = 30): Promise<string> {
  const { createHash, randomBytes } = await import('node:crypto');
  const token = randomBytes(32).toString('base64url');
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `insert into email_tokens (id, user_id, kind, token_hash, expires_at)
       select gen_random_uuid()::text, id, 'password_reset', $2, now() + make_interval(mins => $3)
       from users where lower(email) = lower($1)`,
      [email, createHash('sha256').update(token).digest('hex'), minutesValid],
    );
  } finally {
    await client.end();
  }
  return token;
}
