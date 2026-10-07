'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/current-user';
import * as finance from '@/modules/finance/service';
import type { ImportRowStatus } from '@/modules/finance/statement';
import { statementImportSchema } from '@/modules/finance/validators';

type Rows = { occurredOn: string; amountMinor: string; description: string; selected: boolean }[];

export type PreviewResult =
  { ok: true; statuses: ImportRowStatus[] } | { ok: false; message: string };

export type ImportResult =
  { ok: true; inserted: number; skipped: number } | { ok: false; message: string };

/** Compare a statement with the ledger before anything is written. */
export async function previewImportAction(accountId: string, rows: Rows): Promise<PreviewResult> {
  const user = await requireUser();
  const parsed = statementImportSchema.safeParse({ accountId, rows });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'That file could not be read' };
  }

  const result = await finance.previewImport(user.id, parsed.data);
  return result.ok
    ? { ok: true, statuses: result.value }
    : { ok: false, message: result.error.message };
}

export async function importStatementAction(accountId: string, rows: Rows): Promise<ImportResult> {
  const user = await requireUser();
  const parsed = statementImportSchema.safeParse({ accountId, rows });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'That file could not be read' };
  }

  const result = await finance.importStatement(user.id, parsed.data);
  if (!result.ok) return { ok: false, message: result.error.message };

  revalidatePath('/finance');
  revalidatePath('/today');
  return { ok: true, ...result.value };
}
