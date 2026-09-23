import { z } from 'zod';
import { SUPPORTED_CURRENCIES } from '@nestedflow/domain/money';

const decimalString = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[+-]?\d*(\.\d{1,8})?$/, 'Use up to 8 decimal places');

export const TRADE_ENVIRONMENTS = ['live', 'paper', 'backtest'] as const;
export const ASSET_CLASSES = ['equity', 'crypto', 'forex', 'futures', 'option'] as const;

export const tradingAccountSchema = z.object({
  name: z.string().trim().min(1).max(120),
  broker: z.string().trim().max(120).optional(),
  currency: z.enum(SUPPORTED_CURRENCIES),
  startingBalance: z.string().trim().max(24).default('0'),
  riskPerTradePercent: z.coerce.number().min(0).max(100).default(1),
  environment: z.enum(TRADE_ENVIRONMENTS).default('live'),
});

export const strategySchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  rules: z.string().trim().max(8000).optional(),
});

export const tradeSchema = z.object({
  tradingAccountId: z.string().length(36),
  strategyId: z.string().length(36).optional().or(z.literal('')),
  symbol: z.string().trim().min(1).max(32).toUpperCase(),
  assetClass: z.enum(ASSET_CLASSES).default('equity'),
  direction: z.enum(['long', 'short']),
  stopPrice: decimalString.optional().or(z.literal('')),
  targetPrice: decimalString.optional().or(z.literal('')),
  plannedRisk: z.string().trim().max(24).optional().or(z.literal('')),
});

export const executionSchema = z.object({
  side: z.enum(['buy', 'sell']),
  quantity: decimalString,
  price: decimalString,
  fee: z.string().trim().max(24).default('0'),
  executedAt: z.string().min(1).max(40),
});

export const noteSchema = z.object({
  kind: z.enum(['thesis', 'review', 'psychology']),
  body: z.string().trim().min(1, 'Write something').max(8000),
  emotionTag: z.string().trim().max(32).optional(),
  confidence: z.coerce.number().int().min(1).max(5).optional(),
});

export type TradingAccountInput = z.infer<typeof tradingAccountSchema>;
export type TradeInput = z.infer<typeof tradeSchema>;
export type ExecutionInput = z.infer<typeof executionSchema>;
export type NoteInput = z.infer<typeof noteSchema>;
