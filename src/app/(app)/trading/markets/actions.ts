'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/current-user';
import { consume, RULES } from '@/lib/security/rate-limit';
import type { FormState } from '@/lib/result';
import { cleanPrice } from '@/modules/markets/alerts';
import { checkAlerts, cleanObserved, type FiredAlert } from '@/modules/markets/alert-service';
import { binanceIdFor, isInstrumentId } from '@/modules/markets/catalog';
import * as repo from '@/modules/markets/repository';

const MAX_ACTIVE_ALERTS = 20;
const MAX_HOLDINGS = 50;

function refresh() {
  revalidatePath('/trading', 'layout');
}

/* ---------------------------------------------------------- price alerts --- */

export async function createAlert(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const instrumentId = String(formData.get('instrumentId') ?? '');
  const direction = String(formData.get('direction') ?? '');
  const target = cleanPrice(String(formData.get('target') ?? ''));

  if (!isInstrumentId(instrumentId)) return { message: 'Unknown market', tone: 'error' };
  if (direction !== 'above' && direction !== 'below') {
    return { fieldErrors: { direction: 'Choose above or below' } };
  }
  if (!target) return { fieldErrors: { target: 'Enter a price, like 4100 or 67000.50' } };
  if ((await repo.countActiveAlerts(user.id)) >= MAX_ACTIVE_ALERTS) {
    return {
      message: `Up to ${MAX_ACTIVE_ALERTS} alerts at once. Remove one first.`,
      tone: 'error',
    };
  }

  await repo.insertAlert(user.id, { instrumentId, direction, target });
  refresh();
  return { message: 'Alert set', tone: 'success' };
}

export async function deleteAlert(formData: FormData): Promise<void> {
  const user = await requireUser();
  await repo.deleteAlert(user.id, String(formData.get('id') ?? ''));
  refresh();
}

export async function rearmAlert(formData: FormData): Promise<void> {
  const user = await requireUser();
  if ((await repo.countActiveAlerts(user.id)) < MAX_ACTIVE_ALERTS) {
    await repo.rearmAlert(user.id, String(formData.get('id') ?? ''));
  }
  refresh();
}

/**
 * Called by the alert watcher with the crypto prices the browser just read.
 * Returns the alerts that fired, for an on-screen toast.
 */
export async function checkAlertsAction(observed: unknown): Promise<FiredAlert[]> {
  const user = await requireUser();
  const limit = await consume(`alerts:${user.id}`, RULES.alertChecksPerHour);
  if (!limit.allowed) return [];

  const fired = await checkAlerts(user.id, cleanObserved(observed));
  if (fired.length > 0) {
    refresh();
    revalidatePath('/notifications');
  }
  return fired;
}

/* -------------------------------------------------------------- holdings --- */

export async function addHolding(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  // A coin typed in by hand wins over the list.
  const coin = String(formData.get('coin') ?? '').trim();
  const instrumentId = coin
    ? (binanceIdFor(coin) ?? '')
    : String(formData.get('instrumentId') ?? '');
  const quantity = cleanPrice(String(formData.get('quantity') ?? ''));
  const rawAverage = String(formData.get('averagePrice') ?? '').trim();
  const averagePrice = rawAverage ? cleanPrice(rawAverage) : null;
  const unitInput = String(formData.get('unit') ?? 'unit');
  const unit = unitInput === 'gram' || unitInput === 'ounce' ? unitInput : 'unit';
  const note =
    String(formData.get('note') ?? '')
      .trim()
      .slice(0, 120) || null;

  if (!isInstrumentId(instrumentId)) return { fieldErrors: { instrumentId: 'Choose a market' } };
  if (!quantity) return { fieldErrors: { quantity: 'Enter how much you hold, like 0.05 or 20' } };
  if (rawAverage && !averagePrice) {
    return { fieldErrors: { averagePrice: 'Enter a price, or leave it empty' } };
  }
  if ((await repo.listHoldings(user.id)).length >= MAX_HOLDINGS) {
    return { message: `Up to ${MAX_HOLDINGS} holdings.`, tone: 'error' };
  }

  await repo.insertHolding(user.id, { instrumentId, quantity, unit, averagePrice, note });
  refresh();
  return { message: 'Holding added', tone: 'success' };
}

export async function deleteHolding(formData: FormData): Promise<void> {
  const user = await requireUser();
  await repo.deleteHolding(user.id, String(formData.get('id') ?? ''));
  refresh();
}
