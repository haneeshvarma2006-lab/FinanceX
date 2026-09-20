import { z } from 'zod';
import { SUPPORTED_CURRENCIES } from '@/lib/money';

/** Bounded so an oversized payload is rejected before it reaches the database. */
const shortText = z.string().trim().min(1).max(120);
const description = z.string().trim().min(1, 'Describe this transaction').max(240);
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'That is not a real date');

/**
 * Amounts arrive as strings and stay strings until the money module parses
 * them into minor units. A z.number() here would put the value through a
 * double before it ever reached the exact path.
 */
const amountString = z.string().trim().min(1, 'Enter an amount').max(24, 'That amount is too long');

export const ACCOUNT_KINDS = ['cash', 'bank', 'card', 'investment', 'broker', 'loan'] as const;

export const accountSchema = z.object({
  name: shortText,
  kind: z.enum(ACCOUNT_KINDS),
  currency: z.enum(SUPPORTED_CURRENCIES),
  openingBalance: amountString.default('0'),
});

export const categorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(['income', 'expense']),
  color: z.string().trim().max(16).optional(),
});

export const transactionSchema = z.object({
  accountId: z.string().length(36),
  categoryId: z.string().length(36).optional().or(z.literal('')),
  occurredOn: isoDate,
  amount: amountString,
  kind: z.enum(['income', 'expense']),
  description,
  merchant: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const transferSchema = z
  .object({
    fromAccountId: z.string().length(36),
    toAccountId: z.string().length(36),
    occurredOn: isoDate,
    amount: amountString,
    description: description.default('Transfer'),
  })
  .refine((v) => v.fromAccountId !== v.toAccountId, {
    message: 'Choose two different accounts',
    path: ['toAccountId'],
  });

export const budgetSchema = z.object({
  categoryId: z.string().length(36),
  period: z.enum(['monthly', 'weekly']),
  amount: amountString,
  startsOn: isoDate,
});

export const subscriptionSchema = z.object({
  name: shortText,
  amount: amountString,
  cadence: z.enum(['weekly', 'monthly', 'quarterly', 'yearly']),
  nextDueOn: isoDate,
  accountId: z.string().length(36).optional().or(z.literal('')),
  categoryId: z.string().length(36).optional().or(z.literal('')),
});

export type AccountInput = z.infer<typeof accountSchema>;
export type TransactionInput = z.infer<typeof transactionSchema>;
export type TransferInput = z.infer<typeof transferSchema>;
