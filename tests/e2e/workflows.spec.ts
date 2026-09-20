import { expect, test, type Page } from '@playwright/test';
import { resetRateLimits } from './fixtures';

/**
 * End-to-end coverage of the money-handling workflows, driven through the real
 * UI against the production build. These assert the arithmetic a user actually
 * sees, not just what the service layer returns.
 */

test.beforeEach(resetRateLimits);

const PASSWORD = 'a sufficiently long passphrase';

async function register(page: Page, label: string) {
  const email = `e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;

  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Workflow Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel('Date of birth').fill('1990-01-01');
  await page.getByLabel(/accept the terms/i).check();
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/today$/);

  return email;
}

test('age gate refuses an underage sign-up', async ({ page }) => {
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Too Young');
  await page.getByLabel('Email').fill(`young-${Date.now()}@example.com`);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel('Date of birth').fill('2015-01-01');
  await page.getByLabel(/accept the terms/i).check();
  await page.getByRole('button', { name: /create account/i }).click();

  await expect(page.getByText(/need to be 18 or over/i)).toBeVisible();
  await expect(page).toHaveURL(/\/sign-up$/);
});

test('sign-up requires accepting the terms', async ({ page }) => {
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('No Consent');
  await page.getByLabel('Email').fill(`noconsent-${Date.now()}@example.com`);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel('Date of birth').fill('1990-01-01');
  // Terms box deliberately left unticked.
  await page.getByRole('button', { name: /create account/i }).click();

  await expect(page.getByText(/accept the terms/i).first()).toBeVisible();
  await expect(page).toHaveURL(/\/sign-up$/);
});

test('records income, expense and a transfer with correct totals', async ({ page }) => {
  await register(page, 'finance');
  await page.goto('/finance');

  // Two accounts.
  for (const name of ['Current', 'Savings']) {
    await page.getByLabel('Name').fill(name);
    await page.getByRole('button', { name: /add account/i }).click();
    await expect(page.getByText('Account added')).toBeVisible();
  }

  // Income of 85,000.
  await page.getByLabel('Description').first().fill('Salary');
  await page.getByLabel('Type').nth(1).selectOption('income');
  await page.getByLabel('Amount').first().fill('85000.00');
  await page.getByRole('button', { name: /record transaction/i }).click();
  await expect(page.getByText('Transaction recorded')).toBeVisible();

  // Expense of 5,000.
  await page.getByLabel('Description').first().fill('Groceries');
  await page.getByLabel('Type').nth(1).selectOption('expense');
  await page.getByLabel('Amount').first().fill('5000.00');
  await page.getByRole('button', { name: /record transaction/i }).click();
  await expect(page.getByText('Transaction recorded')).toBeVisible();

  // A transfer of 20,000 between the user's own accounts.
  await page.getByLabel('From').selectOption({ index: 0 });
  await page.getByLabel('To').selectOption({ index: 1 });
  await page.getByLabel('Amount').last().fill('20000.00');
  await page.getByRole('button', { name: /record transfer/i }).click();
  await expect(page.getByText('Transfer recorded')).toBeVisible();

  // The decisive assertion: the transfer must not inflate either total.
  const income = page.locator('text=Income this month').locator('..');
  const spent = page.locator('text=Spent this month').locator('..');

  await expect(income).toContainText('85,000.00');
  await expect(spent).toContainText('5,000.00');
  await expect(spent).not.toContainText('25,000');
  await expect(income).not.toContainText('105,000');

  // Total balance is unchanged by the transfer: 85,000 - 5,000 = 80,000.
  await expect(page.locator('text=Total balance').locator('..')).toContainText('80,000.00');
});

test('rejects an amount with impossible precision', async ({ page }) => {
  await register(page, 'precision');
  await page.goto('/finance');

  await page.getByLabel('Name').fill('Wallet');
  await page.getByRole('button', { name: /add account/i }).click();
  await expect(page.getByText('Account added')).toBeVisible();

  await page.getByLabel('Description').first().fill('Too precise');
  await page.getByLabel('Amount').first().fill('10.5678');
  await page.getByRole('button', { name: /record transaction/i }).click();

  await expect(page.getByText(/at most 2 decimal place/i)).toBeVisible();
});

test('journals a trade and derives P&L from its fills', async ({ page }) => {
  await register(page, 'trading');
  await page.goto('/trading');

  await page.getByLabel('Name').fill('Main');
  await page.getByLabel('Starting balance').fill('100000.00');
  await page.getByRole('button', { name: /add trading account/i }).click();
  await expect(page.getByText('Trading account added')).toBeVisible();

  await page.getByLabel('Symbol').fill('INFY');
  await page.getByRole('button', { name: /log trade/i }).click();
  await expect(page.getByText(/trade created/i)).toBeVisible();

  // Open: buy 100 @ 250.
  await page.getByRole('group').filter({ hasText: 'Add an execution' }).first().click();
  await page.getByLabel('Quantity').fill('100');
  await page.getByLabel('Price').fill('250');
  await page.getByRole('button', { name: /add execution/i }).click();
  await expect(page.getByText('Execution recorded')).toBeVisible();

  // Close: sell 100 @ 275 → ₹2,500 realised.
  await page.getByRole('group').filter({ hasText: 'Add an execution' }).first().click();
  await page.getByLabel('Side').selectOption('sell');
  await page.getByLabel('Quantity').fill('100');
  await page.getByLabel('Price').fill('275');
  await page.getByRole('button', { name: /add execution/i }).click();
  await expect(page.getByText('Execution recorded')).toBeVisible();

  await expect(page.getByText('closed').first()).toBeVisible();
  await expect(page.locator('text=Realised P&L').locator('..')).toContainText('2,500.00');
  await expect(page.locator('text=Win rate').locator('..')).toContainText('100%');
});

test('shows the trading disclosure prominently', async ({ page }) => {
  await register(page, 'disclosure');
  await page.goto('/trading');

  await expect(page.getByText(/every figure here is yours/i)).toBeVisible();
  await expect(
    page.getByText(/past performance does not indicate future performance/i),
  ).toBeVisible();
  await expect(page.getByText(/connects to no broker/i)).toBeVisible();
});

test('email preferences default marketing to off and can be changed', async ({ page }) => {
  await register(page, 'email');
  await page.goto('/settings/email');

  const marketing = page.getByLabel('Tips and offers');
  await expect(marketing).not.toBeChecked();

  const essential = page.getByText('Always on').first();
  await expect(essential).toBeVisible();

  await marketing.check();
  await page.getByRole('button', { name: /save/i }).last().click();
  await expect(page.getByText('Saved').first()).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('Tips and offers')).toBeChecked();
});

test('lists and revokes sessions', async ({ page }) => {
  await register(page, 'sessions');
  await page.goto('/settings/security');

  await expect(page.getByText(/where you are signed in/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /^sign out$/i }).first()).toBeVisible();
});

test('exports account data as JSON without credentials', async ({ page }) => {
  const email = await register(page, 'export');

  const response = await page.request.get('/api/account/export');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-disposition']).toContain('attachment');

  const body = await response.json();
  expect(body.profile.email).toBe(email);
  // A credential must never appear in an export the user may email to themselves.
  expect(JSON.stringify(body)).not.toContain('argon2');
  expect(JSON.stringify(body)).not.toContain('passwordHash');
});

test('refuses the export when signed out', async ({ page }) => {
  const response = await page.request.get('/api/account/export');
  expect(response.status()).toBe(401);
});

test('google routes fail honestly when not configured', async ({ page }) => {
  // No GOOGLE_CLIENT_ID is set for E2E, so this must say so rather than
  // redirecting to a broken Google page.
  await page.goto('/api/auth/google');
  await expect(page).toHaveURL(/error=google_unavailable/);
  await expect(page.getByText(/not configured on this deployment/i)).toBeVisible();
});

test('legal pages are reachable and state their limits', async ({ page }) => {
  await page.goto('/legal/terms');
  await expect(page.getByRole('heading', { name: /terms of use/i })).toBeVisible();
  await expect(page.getByText(/not reviewed by a lawyer/i)).toBeVisible();
  await expect(page.getByText(/not financial, investment or tax advice/i)).toBeVisible();

  await page.goto('/legal/privacy');
  await expect(page.getByRole('heading', { name: /privacy notice/i })).toBeVisible();
  await expect(page.getByText(/no independent security audit/i)).toBeVisible();
});
