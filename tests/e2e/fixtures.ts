import { Client } from 'pg';

const DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? 'postgresql://kylix:kylix@localhost:5432/kylix_e2e';

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
