import { expect, test, type Page, type WebSocketRoute } from '@playwright/test';
import { resetRateLimits } from './fixtures';

/**
 * Live markets, driven by a stand-in for Binance's public stream.
 *
 * The test environment has no route to Binance, and a test must not depend on
 * a real market anyway. Playwright intercepts the socket the page opens, so
 * what is checked is everything this app does with real ticker messages: the
 * price it shows, the direction flash, the 24h change, and reconnecting with
 * a new stream list when the watchlist changes.
 */

test.beforeEach(resetRateLimits);

async function register(page: Page, label: string) {
  const email = `e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Markets Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a sufficiently long passphrase');
  await page.getByLabel('Date of birth').fill('1990-01-01');
  await page.getByLabel(/accept the terms/i).check();
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/today$/, { timeout: 15_000 });
}

const ticker = (symbol: string, price: string, change: string) =>
  JSON.stringify({
    stream: `${symbol.toLowerCase()}@ticker`,
    data: { e: '24hrTicker', E: 1, s: symbol, c: price, P: change, h: '70000', l: '60000' },
  });

test('crypto ticks live, flashes its direction, and follows the watchlist', async ({ page }) => {
  const sockets: WebSocketRoute[] = [];
  await page.routeWebSocket(/data-stream\.binance\.vision/, (ws) => {
    sockets.push(ws);
  });

  await register(page, 'markets');
  await page.goto('/trading');
  await page.getByRole('link', { name: 'Live markets' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Live markets');

  await expect.poll(() => sockets.length).toBeGreaterThan(0);
  const stream = sockets.at(-1)!;
  expect(stream.url()).toContain('btcusdt@ticker');
  expect(stream.url()).toContain('paxgusdt@ticker');

  const btc = page.getByRole('listitem').filter({ hasText: 'Bitcoin' });
  stream.send(ticker('BTCUSDT', '67000.50', '2.50'));
  await expect(btc.getByText('67,000.50')).toBeVisible();
  await expect(btc.getByText('+2.50%')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Live' })).toBeVisible();

  stream.send(ticker('BTCUSDT', '66990.10', '2.48'));
  await expect(btc.getByText('66,990.10')).toHaveAttribute('data-direction', 'down');
  stream.send(ticker('BTCUSDT', '67010.00', '2.52'));
  await expect(btc.getByText('67,010.00')).toHaveAttribute('data-direction', 'up');

  // A message that is not a ticker changes nothing.
  stream.send('{"result":null,"id":1}');
  await expect(btc.getByText('67,010.00')).toBeVisible();

  // Without a data key, gold, forex and shares say so — no number appears.
  await expect(page.getByText(/not connected yet/i)).toBeVisible();
  const gold = page.getByRole('listitem').filter({ hasText: 'XAU/USD' });
  await expect(gold.getByText('Not connected')).toBeVisible();

  // Adding a coin reconnects with it on the stream list, and the choice sticks.
  await page.getByRole('button', { name: 'Add markets' }).click();
  await page.getByLabel('Any other coin on Binance').fill('pepe');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect.poll(() => sockets.at(-1)!.url()).toContain('pepeusdt@ticker');
  await expect(page.getByRole('listitem').filter({ hasText: 'PEPE/USDT' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('listitem').filter({ hasText: 'PEPE/USDT' })).toBeVisible();
});

test('the keyed quotes endpoint needs a session and reports no provider honestly', async ({
  page,
  request,
}) => {
  expect((await request.get('/api/markets/quotes?ids=td:XAU/USD')).status()).toBe(401);

  await register(page, 'quotes');
  const res = await page.request.get('/api/markets/quotes?ids=td:XAU/USD');
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ configured: false });
});

test("the page may reach Binance's market data and nowhere else", async ({ page }) => {
  const response = await page.goto('/sign-in');
  const csp = response?.headers()['content-security-policy'] ?? '';
  expect(csp).toMatch(
    /connect-src 'self' wss:\/\/data-stream\.binance\.vision https:\/\/data-api\.binance\.vision(;|$)/,
  );
});
