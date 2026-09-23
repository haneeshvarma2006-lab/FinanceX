import { afterEach, describe, expect, it } from 'vitest';

import { GET } from '@/app/api/health/route';

type Body = {
  status: 'ok' | 'unhealthy';
  checks: Record<
    'environment' | 'database' | 'migrations',
    { ok: boolean; reason?: string; hint?: string; detail?: string }
  >;
};

async function health(): Promise<{ status: number; body: Body; raw: string }> {
  const response = await GET();
  const raw = await response.text();
  return { status: response.status, body: JSON.parse(raw) as Body, raw };
}

describe('GET /api/health', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('reports healthy against a migrated database', async () => {
    const { status, body } = await health();

    expect(status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.checks.environment.ok).toBe(true);
    expect(body.checks.database.ok).toBe(true);
    expect(body.checks.migrations.ok).toBe(true);
  });

  it('names an invalid variable, and does not blame the database for it', async () => {
    delete process.env.AUTH_SECRET;

    const { status, body } = await health();

    expect(status).toBe(503);
    expect(body.checks.environment.ok).toBe(false);
    expect(body.checks.environment.reason).toContain('AUTH_SECRET');
    expect(body.checks.database.reason).toMatch(/not checked/);
  });

  it('never discloses a secret value, a connection string or a hostname', async () => {
    const databaseUrl = process.env.DATABASE_URL!;
    const secret = process.env.AUTH_SECRET!;
    const host = new URL(databaseUrl).hostname;

    // Healthy and unhealthy both, since a leak in an error path is the classic
    // way these endpoints give away more than intended.
    const healthy = await health();
    process.env.AUTH_SECRET = 'too short';
    const unhealthy = await health();

    for (const { raw } of [healthy, unhealthy]) {
      expect(raw).not.toContain(databaseUrl);
      expect(raw).not.toContain(secret);
      expect(raw).not.toContain('too short');
      expect(raw).not.toContain(host);
    }
  });

  it('is never cached, so a fixed deployment does not keep reporting the old failure', async () => {
    const response = await GET();
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});
