import { expect, test, type Page, type WebSocketRoute } from '@playwright/test';
import { resetRateLimits } from './fixtures';

/**
 * Budgets, recurring bills, price alerts and the portfolio, through the UI.
 * Binance is stood in for — its stream by an intercepted socket, its price
 * check by an intercepted request — so the test needs no network and no
 * real market.
 */

test.beforeEach(resetRateLimits);

async function register(page: Page, label: string) {
  const email = `e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Money Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a sufficiently long passphrase');
  await page.getByLabel('Date of birth').fill('1990-01-01');
  await page.getByLabel(/accept the terms/i).check();
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/today$/, { timeout: 15_000 });
}

/**
 * A day `days` from today on the account's own calendar. New accounts are on
 * India time, which is a day ahead of UTC every evening after 18:30 UTC, so
 * counting from the test machine's clock made "in 2 days" read as "tomorrow".
 */
function isoIn(days: number): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

test('a budget fills as you spend and warns near the limit', async ({ page }) => {
  await register(page, 'budget');
  await page.goto('/finance');
  await page.getByRole('button', { name: 'New account' }).click();
  await page.getByLabel('Name').fill('HDFC');
  await page.getByRole('button', { name: /add account/i }).click();
  await expect(page.getByText('Account added')).toBeVisible();

  await page.getByRole('button', { name: 'New budget' }).click();
  await page.getByLabel('Category').fill('Food');
  await page.getByLabel(/Monthly limit/).fill('1000');
  await page.getByRole('button', { name: 'Save budget' }).click();
  await expect(page.getByText('Budget saved')).toBeVisible();

  const budgets = page.getByRole('region', { name: 'Budgets' });
  await expect(budgets.getByText('₹1,000.00 left')).toBeVisible();

  // Spending in that category fills it; past 80% it warns.
  await page.getByRole('button', { name: 'Add transaction' }).click();
  await page.getByLabel('Description').fill('Dinner');
  await page.getByLabel('Amount').fill('850');
  await page.getByLabel('Category').selectOption({ label: 'Food (expense)' });
  await page.getByRole('button', { name: /record transaction/i }).click();
  await expect(page.getByText('Transaction recorded')).toBeVisible();

  await expect(budgets.getByText('85% used')).toBeVisible();
  await expect(budgets.getByText('₹150.00 left')).toBeVisible();
  await expect(budgets.getByRole('progressbar', { name: 'Food budget used' })).toHaveAttribute(
    'aria-valuenow',
    '85',
  );
});

test('a recurring bill reminds on Today and Paid records it once', async ({ page }) => {
  await register(page, 'recurring');
  await page.goto('/finance');
  await page.getByRole('button', { name: 'New account' }).click();
  await page.getByLabel('Name').fill('HDFC');
  await page.getByRole('button', { name: /add account/i }).click();
  await expect(page.getByText('Account added')).toBeVisible();

  await page.getByRole('button', { name: 'New bill' }).click();
  await page.getByLabel('What is it?').fill('Netflix');
  await page.getByLabel('Amount').fill('649');
  await page.getByLabel('Next due').fill(isoIn(2));
  await page.getByLabel('Paid from').selectOption({ label: 'HDFC' });
  await page.getByRole('button', { name: 'Add recurring bill' }).click();
  await expect(page.getByText('Recurring bill added')).toBeVisible();

  const bills = page.getByRole('region', { name: 'Recurring bills' });
  await expect(bills.getByText('Due in 2 days')).toBeVisible();
  await expect(bills.getByText(/About ₹649.00 a month/)).toBeVisible();

  // Three days out, Today and the inbox both say so.
  await page.goto('/today');
  await expect(page.getByText('Netflix: due in 2 days')).toBeVisible();
  await page.goto('/notifications');
  await expect(page.getByText('Netflix: due in 2 days')).toBeVisible();

  await page.goto('/finance');
  await page.getByRole('button', { name: 'Mark Netflix paid' }).click();
  await expect(bills.getByText('Due in 2 days')).toHaveCount(0);
  await expect(bills.getByText(/Due in \d+ days/)).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Recent transactions' }).getByText('Netflix'),
  ).toBeVisible();
});

const ticker = (symbol: string, price: string) =>
  JSON.stringify({
    stream: `${symbol.toLowerCase()}@ticker`,
    data: { e: '24hrTicker', E: 1, s: symbol, c: price, P: '1.00', h: price, l: price },
  });

test('a price alert goes off when the price crosses, and lands in notifications', async ({
  page,
}) => {
  await page.routeWebSocket(/data-stream\.binance\.vision/, () => {});
  let btc = '69000.00';
  await page.route(/data-api\.binance\.vision\/api\/v3\/ticker\/price/, (route) =>
    route.fulfill({ json: [{ symbol: 'BTCUSDT', price: btc }] }),
  );

  await register(page, 'alerts');
  await page.goto('/trading/markets');
  await page.getByRole('button', { name: 'Alert for Bitcoin' }).click();
  await page.getByLabel('Direction').selectOption('above');
  await page.getByLabel('Price', { exact: true }).fill('70000');
  await page.getByRole('button', { name: 'Set alert' }).click();
  await expect(page.getByText('Alert set')).toBeVisible();

  const tile = page.getByRole('listitem').filter({ hasText: 'BTC/USDT' });
  await expect(tile.getByText('Above 70,000.00')).toBeVisible();
  await expect(
    page.getByRole('region', { name: /Your alerts/ }).getByText('Waiting', { exact: true }),
  ).toBeVisible();

  // The watcher checks shortly after the list changes: not yet crossed.
  await page.waitForTimeout(2500);
  await expect(page.getByText(/Bitcoin is above/)).toHaveCount(0);

  // The market moves; the next check rings.
  btc = '70120.00';
  await page.reload();
  await expect(
    page.getByRole('status').filter({ hasText: 'Bitcoin is above 70,000.00' }),
  ).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(/Went off/)).toBeVisible();

  await page.goto('/notifications');
  await expect(page.getByText('Bitcoin is above 70,000.00')).toBeVisible();
});

test('the portfolio values holdings at the live price', async ({ page }) => {
  const sockets: WebSocketRoute[] = [];
  await page.routeWebSocket(/data-stream\.binance\.vision/, (ws) => {
    sockets.push(ws);
  });

  await register(page, 'portfolio');
  await page.goto('/trading/portfolio');
  await expect(page.getByText('No holdings yet')).toBeVisible();

  await page.getByRole('button', { name: 'Add holding' }).click();
  await page.getByLabel('Market').selectOption('bn:BTCUSDT');
  await page.getByLabel('How much').fill('0.5');
  await page.getByLabel(/Paid per unit/).fill('60000');
  await page.getByRole('button', { name: 'Add to portfolio' }).click();
  await expect(page.getByText('Holding added')).toBeVisible();

  await expect.poll(() => sockets.length).toBeGreaterThan(0);
  sockets.at(-1)!.send(ticker('BTCUSDT', '70000.00'));

  const holding = page.getByRole('listitem').filter({ hasText: 'Bitcoin' });
  await expect(holding.getByText('$35,000.00')).toBeVisible();
  await expect(holding.getByText(/\+\$5,000\.00 \(\+16\.67%\)/)).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Portfolio total' }).getByText('$35,000.00'),
  ).toBeVisible();

  // Gold in grams, with no data key: it says so rather than guessing a price.
  await page.getByRole('button', { name: 'Add holding' }).click();
  await page.getByLabel('Market').selectOption('td:XAU/USD');
  await page.getByLabel('How much').fill('10');
  await page.getByRole('button', { name: 'Add to portfolio' }).click();
  await expect(page.getByText('Holding added')).toBeVisible();
  const gold = page.getByRole('listitem').filter({ hasText: 'Gold' });
  await expect(gold.getByText('10 g')).toBeVisible();
  await expect(gold.getByText('Needs a market-data connection')).toBeVisible();

  await page.getByRole('button', { name: 'Remove Gold from portfolio' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'XAU' })).toHaveCount(0);
});
