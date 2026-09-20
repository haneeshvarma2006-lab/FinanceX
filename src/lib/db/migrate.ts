import 'dotenv/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './client';

async function main(): Promise<void> {
  console.warn('Applying migrations…');
  await migrate(db, { migrationsFolder: './db/migrations' });
  console.warn('Migrations applied.');
  await pool.end();
}

main().catch((error: unknown) => {
  console.error('Migration failed:', error);
  process.exitCode = 1;
});
