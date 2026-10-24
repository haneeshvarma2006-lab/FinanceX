import { expect, test, type Page } from '@playwright/test';
import { resetRateLimits } from './fixtures';

/**
 * The first-run guide, and a bank statement PDF imported from upload to
 * insights. The PDFs are invented sample statements (tests/fixtures/
 * statements), one of them locked with a password the way banks send them.
 */

test.beforeEach(resetRateLimits);

async function register(page: Page, label: string) {
  const email = `e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Statement Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a sufficiently long passphrase');
  await page.getByLabel('Date of birth').fill('1990-01-01');
  await page.getByLabel(/accept the terms/i).check();
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/today$/, { timeout: 15_000 });
}

test('a new account is guided through three steps, ticked off as each is done', async ({
  page,
}) => {
  await register(page, 'guide');
  const guide = page.getByRole('region', { name: 'Set up your money in 3 steps' });
  await expect(guide).toBeVisible();
  await expect(guide.getByText('0 of 3 done', { exact: false })).toBeVisible();

  // Each step opens the right form directly.
  await guide.getByRole('link', { name: 'Add account' }).click();
  await expect(page.getByRole('dialog', { name: 'New account' })).toBeVisible();
  await page.getByLabel('Name').fill('HDFC Savings');
  await page.getByRole('button', { name: /add account/i }).click();
  await expect(page.getByText('Account added')).toBeVisible();

  await page.goto('/today');
  await expect(guide.getByText('1 of 3 done', { exact: false })).toBeVisible();
  await expect(guide.getByText('Add your bank account (done)')).toBeAttached();

  await guide.getByRole('link', { name: 'Set a budget' }).click();
  await expect(page.getByRole('dialog', { name: 'New budget' })).toBeVisible();
  await page.goto('/today');
  await guide.getByRole('link', { name: 'Add a bill' }).click();
  await expect(page.getByRole('dialog', { name: 'New bill' })).toBeVisible();

  // Hidden, it stays hidden.
  await page.goto('/today');
  await guide.getByRole('button', { name: 'Hide this guide' }).click();
  await expect(guide).toBeHidden();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Set up your money in 3 steps' })).toBeHidden();
});

test('a locked statement PDF is read on the device, sorted, imported and explained', async ({
  page,
}) => {
  await register(page, 'pdf');
  await page.goto('/finance?new=account');
  await page.getByLabel('Name').fill('HDFC Savings');
  await page.getByRole('button', { name: /add account/i }).click();
  await expect(page.getByText('Account added')).toBeVisible();

  await page.goto('/finance/import');
  await page
    .getByLabel('Statement file (PDF or CSV)')
    .setInputFiles('tests/fixtures/statements/savings-locked.pdf');

  // Locked: it asks for the password, and a wrong one is said to be wrong.
  const password = page.getByLabel('Statement password');
  await expect(password).toBeVisible();
  await password.fill('not-it');
  await page.getByRole('button', { name: 'Open statement' }).click();
  await expect(page.getByText('That password did not open it.', { exact: false })).toBeVisible();
  await password.fill('SAMPLE123');
  await page.getByRole('button', { name: 'Open statement' }).click();

  await expect(page.getByText('savings-locked.pdf · 7 rows', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Preview 7 transactions' }).click();

  // Names are tidied and categories guessed, before anything is saved.
  await expect(page.getByText('Where the money went', { exact: false })).toBeVisible();
  await expect(page.getByLabel('Category for Swiggy')).toHaveValue('Food');
  await expect(page.getByLabel('Category for Hpcl Petrol Pump')).toHaveValue('Fuel');
  await expect(page.getByLabel('Category for Crossword Bookstores')).toHaveValue('Books');
  await expect(page.getByLabel('Category for Rahul Sample')).toHaveValue('Rent');
  // A guess can be changed.
  await page.getByLabel('Category for Amazon India').selectOption('Groceries');

  await page.getByRole('button', { name: 'Import 7 transactions' }).click();
  await expect(page.getByText('Imported 7 transactions into HDFC Savings')).toBeVisible();

  await page.getByRole('link', { name: 'See where it went' }).click();
  await expect(page).toHaveURL(/\/finance\/insights\?month=2026-10$/);
  await expect(page.getByRole('heading', { name: 'Where your money went' })).toBeVisible();

  const categories = page.getByRole('region', { name: 'By category' });
  await expect(categories.getByText('Rent', { exact: true })).toBeVisible();
  await expect(categories.getByText('Groceries', { exact: true })).toBeVisible();
  await expect(categories.getByText('₹15,000.00')).toBeVisible();
  await expect(
    page.getByText('Rent took the most: ₹15,000.00, 56% of your spending.'),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: 'Where you spent most' })).toContainText('Swiggy');

  // The month's numbers match the statement: ₹85,000 in, ₹26,935 out.
  const numbers = page.getByRole('region', { name: 'October 2026 in numbers' });
  await expect(numbers).toContainText('₹26,935.00');
  await expect(numbers).toContainText('₹85,000.00');
});

test('a scanned or unrelated PDF is turned away with a reason', async ({ page }) => {
  await register(page, 'notpdf');
  await page.goto('/finance?new=account');
  await page.getByLabel('Name').fill('HDFC Savings');
  await page.getByRole('button', { name: /add account/i }).click();
  await expect(page.getByText('Account added')).toBeVisible();

  await page.goto('/finance/import');
  await page.getByLabel('Statement file (PDF or CSV)').setInputFiles({
    name: 'broken.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 this is not really a pdf'),
  });
  await expect(page.getByText('That PDF could not be opened.', { exact: false })).toBeVisible();
});

test('a place is sorted once for the whole statement, remembered next time, and leftovers sorted from insights', async ({
  page,
}) => {
  await register(page, 'places');
  await page.goto('/finance?new=account');
  await page.getByLabel('Name').fill('Savings');
  await page.getByRole('button', { name: /add account/i }).click();
  await expect(page.getByText('Account added')).toBeVisible();

  const csv = (lines: string[]) => ({
    name: 'statement.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(['Date,Narration,Withdrawal Amt.,Deposit Amt.', ...lines].join('\n')),
  });

  // September: three payments to one person, the bank shortening the name once.
  await page.goto('/finance/import');
  await page
    .getByLabel('Statement file (PDF or CSV)')
    .setInputFiles(
      csv([
        '01/09/26,UPI/RAMESH BABU/41230001/UPI,"8,000.00",',
        '05/09/26,UPI/RAMESH BAB/41230002/UPI,"8,000.00",',
        '09/09/26,UPI/RAMESH BABU/41230003/UPI,500.00,',
        '10/09/26,UPI/ASHA KUMARI/41230004/UPI,"1,000.00",',
      ]),
    );
  await page.getByRole('button', { name: 'Preview 4 transactions' }).click();

  const places = page.getByRole('region', { name: 'Sort by place' });
  await expect(places).toContainText('0 of 4 payments have a category');
  await places.getByLabel('Category for every payment to Ramesh Babu').selectOption('Rent');
  // One choice, all three payments.
  const rows = page.getByLabel(/^Category for Ramesh Bab/);
  await expect(rows).toHaveCount(3);
  for (let i = 0; i < 3; i += 1) await expect(rows.nth(i)).toHaveValue('Rent');
  await expect(places).toContainText('3 of 4 payments have a category');

  await page.getByRole('button', { name: 'Import 4 transactions' }).click();
  await expect(page.getByText('Imported 4 transactions into Savings')).toBeVisible();

  // October: the same person again, already filed from last time.
  await page.getByRole('button', { name: 'Import another' }).click();
  await page
    .getByLabel('Statement file (PDF or CSV)')
    .setInputFiles(csv(['10/10/26,UPI/RAMESH BABU/41230009/UPI,"8,000.00",']));
  await page.getByRole('button', { name: 'Preview 1 transaction' }).click();
  await expect(page.getByLabel('Category for Ramesh Babu')).toHaveValue('Rent');
  await expect(page.getByRole('region', { name: 'Sort by place' })).toContainText('remembered');
  await page.getByRole('button', { name: 'Import 1 transaction' }).click();
  await expect(page.getByText('Imported 1 transaction into Savings')).toBeVisible();

  // What was left unsorted in September is sorted from its insights.
  await page.goto('/finance/insights?month=2026-09');
  const sort = page.getByRole('region', { name: 'Sort your payments' });
  await expect(sort).toContainText('Asha Kumari');
  await sort.getByLabel('Category for Asha Kumari').selectOption('Shopping');
  await sort.getByRole('button', { name: 'File Asha Kumari under Shopping' }).click();
  await expect(page.getByText('1 payment filed under Shopping')).toBeVisible();
  await expect(sort).toContainText('Every payment this month has a category.');
  const categories = page.getByRole('region', { name: 'By category' });
  await expect(categories.getByText('Shopping', { exact: true })).toBeVisible();
  await expect(categories.getByText('Not sorted', { exact: true })).toHaveCount(0);
});

test('every transaction can be found, fixed and downloaded; monthly payments become bills', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await register(page, 'ledger');
  await page.goto('/finance?new=account');
  await page.getByLabel('Name').fill('Savings');
  await page.getByRole('button', { name: /add account/i }).click();
  await expect(page.getByText('Account added')).toBeVisible();

  // Three months of a statement: rent each month, food now and then.
  await page.goto('/finance/import');
  await page.getByLabel('Statement file (PDF or CSV)').setInputFiles({
    name: 'q3.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      [
        'Date,Narration,Withdrawal Amt.,Deposit Amt.',
        '05/07/26,UPI/RAMESH BABU/41230001/RENT,"15,000.00",',
        '05/08/26,UPI/RAMESH BABU/41230002/RENT,"15,000.00",',
        '05/09/26,UPI/RAMESH BABU/41230003/RENT,"15,000.00",',
        '12/09/26,UPI/HOTEL SAGAR/41230004/UPI,320.00,',
        '15/09/26,UPI/ASHA KUMARI/41230005/UPI,"1,000.00",',
      ].join('\n'),
    ),
  });
  await page.getByRole('button', { name: 'Preview 5 transactions' }).click();
  await page.getByRole('button', { name: 'Import 5 transactions' }).click();
  await expect(page.getByText('Imported 5 transactions into Savings')).toBeVisible();

  // All transactions: search, then fix one payment's category in place.
  await page.goto('/finance');
  await page.getByRole('link', { name: 'See all' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('All transactions');
  await page.getByLabel('Search').fill('asha');
  await page.getByRole('button', { name: 'Show' }).click();
  const results = page.getByRole('region', { name: 'Matching transactions' });
  await expect(results).toContainText('1 transaction · ₹1,000.00 out');
  await results.getByLabel(/^Category for Asha Kumari/).selectOption('Shopping');
  await page.goto('/finance/transactions?category=none');
  await expect(page.getByText('Asha Kumari')).toHaveCount(0);

  // Download what is shown, as a spreadsheet.
  await page.goto('/finance/transactions?q=ramesh');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Download CSV' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('transactions.csv');
  const csv = await (await import('node:fs/promises')).readFile(await download.path(), 'utf8');
  const lines = csv.replace(/^﻿/, '').trim().split('\r\n');
  expect(lines[0]).toBe('Date,Description,Category,Account,Type,Amount,Currency,Bank line');
  expect(lines).toHaveLength(4);
  expect(lines[1]).toBe(
    '2026-09-05,Ramesh Babu,Rent,Savings,expense,-15000.00,INR,UPI/RAMESH BABU/41230003/RENT',
  );

  // Insights: six months at a glance, a category opens its payments, and rent is
  // recognised as something paid every month.
  await page.goto('/finance/insights?month=2026-09');
  const trend = page.getByRole('region', { name: 'Last 6 months' });
  await expect(
    trend.getByRole('link', { name: /September 2026: ₹16,320\.00 spent/ }),
  ).toHaveAttribute('aria-current', 'page');
  await page
    .getByRole('region', { name: 'By category' })
    .getByRole('link', { name: 'Food' })
    .click();
  await expect(page).toHaveURL(/\/finance\/transactions\?month=2026-09&category=.+&direction=out$/);
  await expect(page.getByText('Hotel Sagar')).toBeVisible();

  await page.goto('/finance/insights?month=2026-09');
  const monthly = page.getByRole('region', { name: 'Paid every month' });
  await expect(monthly).toContainText('Ramesh Babu');
  await monthly.getByRole('button', { name: 'Track Ramesh Babu as a monthly bill' }).click();
  await expect(page.getByText('Ramesh Babu is now a bill, with a reminder')).toBeVisible();
  await expect(monthly).toContainText('Everything that repeats monthly is tracked as a bill.');

  await page.goto('/finance');
  const bills = page.getByRole('region', { name: 'Recurring bills' });
  await expect(bills).toContainText('Ramesh Babu');
  await expect(bills).toContainText('₹15,000.00');
});
