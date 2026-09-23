import { NextResponse } from 'next/server';

import journal from '../../../../db/migrations/meta/_journal.json';
import { databaseUrlIsLoopback, inspectEnv } from '@/lib/env';
import { appliedMigrationCount, ping } from '@/modules/system/repository';

/**
 * Deployment health, for the operator.
 *
 * A misconfigured deployment otherwise shows every visitor the same opaque
 * "a server error occurred", and the reason sits in logs the operator may not
 * be able to reach. This answers the three questions that account for nearly
 * every first-deploy failure — is the configuration valid, can the database be
 * reached, have the migrations been run — in a form someone can read off a
 * browser tab.
 *
 * What it will never include: a variable's value, a connection string, a
 * hostname, or a raw driver error. Names of invalid variables and a short
 * reason are the whole disclosure — plus one bit, whether DATABASE_URL points
 * at this machine, because that single misconfiguration is common enough and
 * "localhost" is not a secret. It must also work when configuration is
 * broken, so it never calls `getEnv()`, which throws.
 */
export const dynamic = 'force-dynamic';

type Check = { ok: true; detail?: string } | { ok: false; reason: string; hint?: string };

const EXPECTED_MIGRATIONS = journal.entries.length;

/** A Postgres or socket error reduced to a reason that leaks nothing. */
function describeDatabaseError(error: unknown): string {
  const candidate = error as { code?: string; errors?: { code?: string }[]; message?: string };
  const code = candidate.code ?? candidate.errors?.[0]?.code;

  switch (code) {
    case 'ECONNREFUSED':
      return 'connection refused — nothing is listening at that address';
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return 'host not found';
    case 'ETIMEDOUT':
      return 'connection timed out';
    case '28P01':
    case '28000':
      return 'authentication failed — check the username and password';
    case '3D000':
      return 'the database named in the connection string does not exist';
    default:
      return /timeout/i.test(candidate.message ?? '')
        ? 'connection timed out'
        : 'could not connect';
  }
}

async function checkDatabase(): Promise<Check> {
  try {
    await ping();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: describeDatabaseError(error),
      hint: databaseUrlIsLoopback()
        ? 'DATABASE_URL points at localhost. On a hosting platform that is the function itself, not your database. Use your provider’s connection string.'
        : undefined,
    };
  }
}

async function checkMigrations(): Promise<Check> {
  try {
    const applied = await appliedMigrationCount();
    if (applied >= EXPECTED_MIGRATIONS) {
      return { ok: true, detail: `${applied} of ${EXPECTED_MIGRATIONS} applied` };
    }
    return {
      ok: false,
      reason: `${applied} of ${EXPECTED_MIGRATIONS} migrations applied`,
      hint: 'Run `pnpm db:migrate` against this database.',
    };
  } catch (error) {
    const code = (error as { code?: string }).code;
    // 3F000: schema does not exist. 42P01: table does not exist.
    if (code === '3F000' || code === '42P01') {
      return {
        ok: false,
        reason: 'migrations have never been run on this database',
        hint: 'Run `pnpm db:migrate` against this database.',
      };
    }
    return { ok: false, reason: 'could not read migration state' };
  }
}

export async function GET(): Promise<NextResponse> {
  const env = inspectEnv();

  const environment: Check = env.ok
    ? { ok: true }
    : {
        ok: false,
        reason: `invalid or missing: ${env.invalid.join(', ')}`,
        hint: 'Set these in your hosting provider’s environment settings, then redeploy.',
      };

  // Without a valid configuration there is no connection string to try, and
  // reporting the database as "down" would send someone looking in the wrong
  // place.
  const database: Check = env.ok
    ? await checkDatabase()
    : { ok: false, reason: 'not checked — fix the environment first' };

  const migrations: Check = database.ok
    ? await checkMigrations()
    : { ok: false, reason: 'not checked — the database is not reachable' };

  const healthy = environment.ok && database.ok && migrations.ok;

  return NextResponse.json(
    { status: healthy ? 'ok' : 'unhealthy', checks: { environment, database, migrations } },
    { status: healthy ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
