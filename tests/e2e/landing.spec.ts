import { expect, test } from '@playwright/test';
import { resetRateLimits } from './fixtures';

test.beforeEach(resetRateLimits);

test('the landing page states the promise and runs without errors', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(m.text());
  });
  page.on('pageerror', (e) => problems.push(e.message));

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('One system for');
  await expect(page.getByRole('heading', { name: /everything talks to/i })).toBeAttached();
  expect(problems).toEqual([]);
});

test('every mockup figure is labelled as example data', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Example data', { exact: true })).toBeVisible();
  await expect(page.getByText(/example data for illustration/i).first()).toBeAttached();
});

test('the early-access field carries the address into sign-up', async ({ page }) => {
  await page.goto('/');
  await page.locator('#cta-email').fill('early@example.com');
  await page.locator('#cta-email').press('Enter');
  await expect(page).toHaveURL(/\/sign-up\?email=early%40example\.com/);
  await expect(page.getByLabel('Email')).toHaveValue('early@example.com');
});

test('sign-up ignores an address-shaped value that is not an address', async ({ page }) => {
  await page.goto('/sign-up?email=%3Cscript%3E');
  await expect(page.getByLabel('Email')).toHaveValue('');
});

test('a signed-in visitor still sees the landing page, with a way into the app', async ({
  page,
}) => {
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Landing Visitor');
  await page.getByLabel('Email').fill(`landing-${Date.now()}@example.com`);
  await page.getByLabel('Password').fill('a sufficiently long passphrase');
  await page.getByLabel('Date of birth').fill('1990-01-01');
  await page.getByLabel(/accept the terms/i).check();
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/today$/);

  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('One system for');
  await expect(page.getByRole('link', { name: 'Get early access' })).toHaveCount(0);

  await page.getByRole('banner').getByRole('link', { name: 'Open app' }).click();
  await expect(page).toHaveURL(/\/today$/);
});

test('the Black / White switch flips the theme and remembers it', async ({ page, context }) => {
  await context.clearCookies();
  await page.goto('/');
  const html = page.locator('html');
  const toggle = page.getByRole('button', { name: /switch between the black and white themes/i });

  // Until the page has hydrated the button does nothing, so each switch
  // retries its click until the theme actually changes rather than racing
  // the page's scripts.
  const switchTo = async (theme: 'light' | 'dark') => {
    await expect(async () => {
      const now = (await html.getAttribute('data-theme')) === 'light' ? 'light' : 'dark';
      if (now !== theme) await toggle.click();
      if (theme === 'light') {
        await expect(html).toHaveAttribute('data-theme', 'light', { timeout: 500 });
      } else {
        await expect(html).not.toHaveAttribute('data-theme', 'light', { timeout: 500 });
      }
    }).toPass();
  };

  await expect(html).not.toHaveAttribute('data-theme', 'light');

  await switchTo('light');
  // Rendered by the server from the cookie, so it survives a reload.
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'light');

  await switchTo('dark');
  await page.reload();
  await expect(html).not.toHaveAttribute('data-theme', 'light');
});
