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
