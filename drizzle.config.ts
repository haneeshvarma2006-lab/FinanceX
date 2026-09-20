import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required to run drizzle-kit');

export default defineConfig({
  schema: './src/modules/**/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  casing: 'snake_case',
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
