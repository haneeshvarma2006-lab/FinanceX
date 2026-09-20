import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/current-user';
import * as identityRepo from '@/modules/identity/repository';
import * as emailRepo from '@/modules/email/repository';
import * as financeRepo from '@/modules/finance/repository';
import * as tradingRepo from '@/modules/trading/repository';

/**
 * Full data export for the signed-in account.
 *
 * Deliberately excluded: the password hash and session token hashes. Exporting
 * a credential — even a hashed one — puts it in a file the user may email to
 * themselves, and it is of no use to them.
 */
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const [
    accounts,
    categories,
    transactions,
    budgets,
    subscriptions,
    netWorth,
    tradingAccounts,
    strategies,
    trades,
    preferences,
    consents,
  ] = await Promise.all([
    financeRepo.listAccounts(user.id, true),
    financeRepo.listCategories(user.id),
    financeRepo.listTransactions(user.id, { limit: 500 }),
    financeRepo.listBudgets(user.id),
    financeRepo.listSubscriptions(user.id),
    financeRepo.listNetWorthSnapshots(user.id),
    tradingRepo.listTradingAccounts(user.id),
    tradingRepo.listStrategies(user.id),
    tradingRepo.listTrades(user.id, { limit: 500 }),
    emailRepo.listPreferences(user.id),
    identityRepo.listConsents(user.id),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    notice:
      'Data you entered into KyliX. Password and session credentials are deliberately excluded.',
    profile: {
      email: user.email,
      displayName: user.displayName,
      timezone: user.timezone,
      locale: user.locale,
      baseCurrency: user.baseCurrency,
      dateOfBirth: user.dateOfBirth,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
    },
    finance: { accounts, categories, transactions, budgets, subscriptions, netWorth },
    trading: { tradingAccounts, strategies, trades },
    emailPreferences: preferences,
    consents,
  };

  // bigint is not JSON-serialisable; render as a decimal string rather than
  // letting it become a lossy number.
  const body = JSON.stringify(
    payload,
    (_key, value) => (typeof value === 'bigint' ? value.toString() : value),
    2,
  );

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="kylix-export-${new Date().toISOString().slice(0, 10)}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
