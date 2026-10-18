import { devices, expect, test, type Page } from '@playwright/test';
import { resetRateLimits } from './fixtures';

/**
 * On a phone, with touch: the camera and the file picker open from a tap.
 *
 * The other suites drive file inputs with setInputFiles, which never proves
 * the tap itself reaches the input. Here the tap is the test — and the case
 * that sent a real person to a dead end, a new account with no money account
 * yet, is covered first.
 */

const { defaultBrowserType: _ignored, ...pixel } = devices['Pixel 7'];
test.use(pixel);
test.beforeEach(resetRateLimits);

async function register(page: Page, label: string) {
  const email = `e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Phone Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a sufficiently long passphrase');
  await page.getByLabel('Date of birth').fill('1990-01-01');
  await page.getByLabel(/accept the terms/i).check();
  await page.getByRole('button', { name: /create account/i }).tap();
  await expect(page).toHaveURL(/\/today$/, { timeout: 15_000 });
}

test('scanning a bill with no account yet asks for one, then opens the camera', async ({
  page,
}) => {
  await register(page, 'phone-scan');
  await page.goto('/finance/scan');

  // No dead end: the account is made right here, in a sheet that opens itself.
  await expect(page.getByRole('dialog', { name: 'New account' })).toBeVisible();
  await page.getByLabel('Name').fill('Cash');
  await page.getByRole('button', { name: /add account/i }).tap();

  const camera = page.getByText('Take a photo');
  await expect(camera).toBeVisible();

  const [shot] = await Promise.all([page.waitForEvent('filechooser'), camera.tap()]);
  expect(await shot.element().getAttribute('capture')).toBe('environment');
  expect(await shot.element().getAttribute('accept')).toBe('image/*');

  const [gallery] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByText('Choose a photo').tap(),
  ]);
  expect(await gallery.element().getAttribute('capture')).toBeNull();
});

test('importing a statement opens the file picker from a tap', async ({ page }) => {
  await register(page, 'phone-import');
  await page.goto('/finance/import');

  await page.getByRole('button', { name: 'New account' }).tap();
  await page.getByLabel('Name').fill('HDFC Savings');
  await page.getByRole('button', { name: /add account/i }).tap();

  const input = page.getByLabel('Statement file (.csv)');
  await expect(input).toBeVisible();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), input.tap()]);
  expect(await chooser.element().getAttribute('accept')).toContain('.csv');
});

test('the camera is allowed for this site and nothing else', async ({ page }) => {
  const response = await page.goto('/sign-in');
  expect(response?.headers()['permissions-policy']).toContain('camera=(self)');
  expect(response?.headers()['permissions-policy']).toContain('microphone=()');
});
