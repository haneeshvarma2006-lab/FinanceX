'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/current-user';
import { fieldErrorsFrom, toFormState, type FormState } from '@/lib/result';

export type { FormState };
import { parseAmount, type Currency } from '@/lib/money';
import * as repo from '@/modules/trading/repository';
import * as trading from '@/modules/trading/service';
import {
  executionSchema,
  strategySchema,
  tradeSchema,
  tradingAccountSchema,
} from '@/modules/trading/validators';

export async function createTradingAccount(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  const parsed = tradingAccountSchema.safeParse({
    name: formData.get('name'),
    broker: formData.get('broker') || undefined,
    currency: formData.get('currency') || user.baseCurrency,
    startingBalance: formData.get('startingBalance') || '0',
    riskPerTradePercent: formData.get('riskPerTradePercent') || 1,
    environment: formData.get('environment') || 'live',
  });

  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  let starting: bigint;
  try {
    starting = parseAmount(parsed.data.startingBalance, parsed.data.currency as Currency);
  } catch (error) {
    return {
      fieldErrors: {
        startingBalance: error instanceof Error ? error.message : 'Invalid amount',
      },
    };
  }

  try {
    await repo.insertTradingAccount(user.id, {
      name: parsed.data.name,
      broker: parsed.data.broker ?? null,
      currency: parsed.data.currency,
      startingBalanceMinor: starting,
      // Percent to basis points, so the stored value is an exact integer.
      riskPerTradeBps: Math.round(parsed.data.riskPerTradePercent * 100),
      environment: parsed.data.environment,
    });
  } catch {
    return { fieldErrors: { name: 'You already have an account with that name' } };
  }

  revalidatePath('/trading');
  return { message: 'Trading account added', tone: 'success' };
}

export async function createStrategy(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const parsed = strategySchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description') || undefined,
    rules: formData.get('rules') || undefined,
  });

  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  try {
    await repo.insertStrategy(user.id, {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      rules: parsed.data.rules ?? null,
    });
  } catch {
    return { fieldErrors: { name: 'You already have a strategy with that name' } };
  }

  revalidatePath('/trading');
  return { message: 'Strategy added', tone: 'success' };
}

export async function createTrade(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const parsed = tradeSchema.safeParse({
    tradingAccountId: formData.get('tradingAccountId'),
    strategyId: formData.get('strategyId') || undefined,
    symbol: formData.get('symbol'),
    assetClass: formData.get('assetClass') || 'equity',
    direction: formData.get('direction'),
    stopPrice: formData.get('stopPrice') || undefined,
    targetPrice: formData.get('targetPrice') || undefined,
    plannedRisk: formData.get('plannedRisk') || undefined,
  });

  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const result = await trading.createTrade(user.id, parsed.data);
  if (!result.ok) return toFormState(result.error);

  revalidatePath('/trading');
  return { message: 'Trade created — add executions to open it', tone: 'success' };
}

export async function addExecution(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const tradeId = String(formData.get('tradeId') ?? '');

  const parsed = executionSchema.safeParse({
    side: formData.get('side'),
    quantity: formData.get('quantity'),
    price: formData.get('price'),
    fee: formData.get('fee') || '0',
    executedAt: formData.get('executedAt'),
  });

  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const result = await trading.addExecution(user.id, tradeId, parsed.data);
  if (!result.ok) return toFormState(result.error);

  revalidatePath('/trading');
  return { message: 'Execution recorded', tone: 'success' };
}
