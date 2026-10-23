import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  canonicalKeys,
  cleanNarration,
  merchantKey,
  samePlace,
  suggestCategory,
} from '@/modules/finance/categorize';
import {
  foldDrCrColumn,
  guessMapping,
  parseStatementAmount,
  readRows,
} from '@/modules/finance/statement';
import { tableFromPdf, type PdfText } from '@/modules/finance/statement-pdf';
import {
  highlights,
  isMonthKey,
  monthRange,
  percentChange,
  shiftMonth,
} from '@/modules/finance/insights';

/**
 * Statement PDFs read back into rows. The fixtures are invented statements
 * in the column layouts Indian banks commonly print (see
 * tests/fixtures/statements/generate.mjs), read with the same PDF library
 * the browser uses.
 */

async function readPdf(file: string, password?: string): Promise<PdfText[][]> {
  const data = new Uint8Array(readFileSync(`tests/fixtures/statements/${file}`));
  const task = getDocument({ data, password, useWasm: false });
  const doc = await task.promise;
  const pages: PdfText[][] = [];
  for (let n = 1; n <= doc.numPages; n += 1) {
    const content = await (await doc.getPage(n)).getTextContent();
    pages.push(
      content.items.flatMap((item) =>
        'str' in item && item.str.trim()
          ? [
              {
                text: item.str,
                x: item.transform[4] as number,
                y: item.transform[5] as number,
                width: item.width,
                height: item.height,
              },
            ]
          : [],
      ),
    );
  }
  await task.destroy();
  return pages;
}

async function rowsOf(file: string, password?: string) {
  const table = tableFromPdf(await readPdf(file, password));
  if (!table) throw new Error('no table');
  const mapping = guessMapping(table.header, table.body);
  return {
    table,
    rows: readRows(table.body, mapping, 'INR').map((r) => ({
      on: r.occurredOn,
      minor: r.amountMinor,
      text: r.description,
      error: r.error,
    })),
  };
}

describe('reading statement PDFs', () => {
  it('reads a two-page savings statement, wrapped narrations and all', async () => {
    const { table, rows } = await rowsOf('savings.pdf');
    expect(table.header).toEqual([
      'Date',
      'Narration',
      'Chq./Ref.No.',
      'Value Dt',
      'Withdrawal Amt.',
      'Deposit Amt.',
      'Closing Balance',
    ]);
    expect(rows.map((r) => [r.on, r.minor])).toEqual([
      ['2026-10-01', -48600n],
      ['2026-10-02', -200000n],
      ['2026-10-03', 8500000n],
      ['2026-10-05', -329900n],
      ['2026-10-07', -1500000n],
      ['2026-10-09', -500000n],
      ['2026-10-12', -115000n],
    ]);
    // The line that wrapped is joined back without a stray space.
    expect(rows[0]!.text).toBe(
      'UPI-SWIGGY-SWIGGY8@YBL-YESB0YBLUPI-412345678901-PAYMENT FROM PHONE',
    );
    // A reference and a date drawn as one run of text are split apart.
    expect(table.body[2]![2]).toBe('SAMPN26276000001');
    expect(table.body[2]![3]).toBe('03/10/26');
    // The summary and footer are not transactions.
    expect(rows.every((r) => r.error === null)).toBe(true);
  });

  it('reads the same statement when its headings are centred', async () => {
    const plain = await rowsOf('savings.pdf');
    const centred = await rowsOf('centred.pdf');
    expect(centred.rows).toEqual(plain.rows);
  });

  it('reads debit and credit columns with named-month dates', async () => {
    const { rows } = await rowsOf('debit-credit.pdf');
    expect(rows.map((r) => [r.on, r.minor])).toEqual([
      ['2026-10-01', -64250n],
      ['2026-10-04', -64900n],
      ['2026-10-06', 120000n],
      ['2026-10-08', -38500n],
    ]);
  });

  it('reads a card statement whose Dr/Cr marks sit in a column of their own', async () => {
    const { table, rows } = await rowsOf('card.pdf');
    expect(table.header).toEqual(['Date', 'Transaction Details', 'Amount (Rs.)']);
    expect(rows.map((r) => r.minor)).toEqual([-179900n, -76000n, 500000n, -425000n]);
  });

  it('opens a locked statement only with its password', async () => {
    await expect(readPdf('savings-locked.pdf')).rejects.toMatchObject({
      name: 'PasswordException',
    });
    await expect(readPdf('savings-locked.pdf', 'wrong')).rejects.toMatchObject({
      name: 'PasswordException',
    });
    const locked = await rowsOf('savings-locked.pdf', 'SAMPLE123');
    expect(locked.rows).toEqual((await rowsOf('savings.pdf')).rows);
  });

  it('finds no table where there is none', () => {
    expect(tableFromPdf([[{ text: 'Hello', x: 10, y: 700, width: 30, height: 10 }]])).toBeNull();
    expect(tableFromPdf([])).toBeNull();
  });
});

describe('statement amounts and columns', () => {
  it('reads a bracketed Dr or Cr after the number', () => {
    expect(parseStatementAmount('500.00(Dr)', 'INR')).toBe(-50000n);
    expect(parseStatementAmount('500.00 (Cr)', 'INR')).toBe(50000n);
  });

  it('folds a Dr/Cr column into the amount beside it', () => {
    const folded = foldDrCrColumn(
      ['Date', 'Details', 'Amount', 'Dr/Cr'],
      [
        ['01/10/26', 'Shop', '100.00', 'Dr'],
        ['02/10/26', 'Refund', '40.00', 'Cr'],
      ],
    );
    expect(folded.header).toEqual(['Date', 'Details', 'Amount']);
    expect(folded.body).toEqual([
      ['01/10/26', 'Shop', '100.00 Dr'],
      ['02/10/26', 'Refund', '40.00 Cr'],
    ]);
    // Without such a column nothing changes.
    expect(foldDrCrColumn(['Date', 'Amount'], [['01/10/26', '5']]).header).toEqual([
      'Date',
      'Amount',
    ]);
  });
});

describe('reading narrations', () => {
  it.each([
    ['UPI-SWIGGY-SWIGGY8@YBL-YESB0YBLUPI-412345678901-PAYMENT FROM PHONE', 'Swiggy'],
    ['UPI-HPCL PETROL PUMP-HPCLPUMP@ICICI-ICIC0DC0099-427700000001-UPI', 'Hpcl Petrol Pump'],
    ['NEFT CR-SAMP0000001-EXAMPLE TECH PVT LTD-SALARY OCT 2026', 'Example Tech Pvt Ltd'],
    ['POS 512345XXXXXX1234 AMAZON PAY INDIA', 'Amazon India'],
    ['TO TRANSFER-UPI/DR/412300000011/ZEPTO/YESB/zepto@ybl/Groceries--', 'Zepto'],
    ['UPI/412300000013/rahul.sharma99@okaxis', 'Rahul Sharma'],
    ['NWD-512345XXXXXX1234-SAMP0001-BANGALORE', 'ATM cash withdrawal'],
    ['MYNTRA DESIGNS PVT LTD BANGALORE', 'Myntra Designs Pvt Ltd Bangalore'],
    ['Coffee with Asha', 'Coffee with Asha'],
  ])('%s → %s', (raw, name) => {
    expect(cleanNarration(raw)).toBe(name);
  });

  it.each([
    ['UPI-SWIGGY-SWIGGY8@YBL-YESB0YBLUPI-412345678901', 'Food'],
    ['UPI-SWIGGY INSTAMART-INSTAMART@AXL', 'Groceries'],
    ['UPI-HPCL PETROL PUMP-HPCLPUMP@ICICI', 'Fuel'],
    ['POS 512345XXXXXX1234 AMAZON PAY INDIA', 'Shopping'],
    ['AMAZON PRIME MEMBERSHIP', 'Subscriptions'],
    ['UPI/DR/4123/NETFLIX/HDFC/netflix@hdfcbank', 'Subscriptions'],
    ['UPI-CROSSWORD BOOKSTORES-CROSSWORD@HDFCBANK', 'Books'],
    ['UPI-RAHUL-RAHUL@OKAXIS-RENT OCT', 'Rent'],
    ['NWD-512345XXXXXX1234-SAMP0001', 'Cash'],
    ['APOLLO PHARMACY', 'Health'],
    ['MAKEMYTRIP INDIA PVT LTD', 'Travel'],
    ['PVR INOX LIMITED', 'Entertainment'],
    ['UPI/JIOMART/jiomart@axis', 'Groceries'],
    ['AIRTEL PREPAID RECHARGE', 'Bills'],
    ['UPI/412/PRIYA S/priya@airtel/Airtel Payments Bank', null],
    ['SMS ALERT CHARGES QTR', 'Bank charges'],
    // Local places, read from the words they use rather than a brand list.
    ['UPI/RAVI MART/412300000001/UPI', 'Groceries'],
    ['UPI/SRI SAI ALLMART/412300000002/UPI', 'Groceries'],
    ['UPI/VIJAYA MAART/412300000003/UPI', 'Groceries'],
    ['UPI/ANNAPURNA RESTURANT/412300000004/Payment for', 'Food'],
    ['UPI/HOTEL SAGAR/412300000005/UPI', 'Food'],
    ['UPI/SUNRISE BEVERAG/412300000006/UPI', 'Food'],
    ['UPI/QUICK BITES/412300000007/UPI', 'Food'],
    ['UPI/APSRTC/412300000008/UPI', 'Transport'],
    ['UPI/GREEN LINE TRANSPOR/412300000009/UPI', 'Transport'],
    ['UPI/CITY MED/412300000010/UPI', 'Health'],
    ['UPI/LAKSHMI MEDICA/412300000011/UPI', 'Health'],
    ['UPI/SV CINEPLEX/412300000012/UPI', 'Entertainment'],
    ['UPI/ABC INSTITUTE OF TE/412300000013/UPI', 'Education'],
    ['Chg: Charge for Deposit on 30-08-2026', 'Bank charges'],
    ['SAVINGS PROGRAM FEE', 'Bank charges'],
    ['TREEBO HOTELS PVT LTD', 'Travel'],
    // Words that only look like a clue.
    ['UPI/SMART POINT/412300000014/UPI', null],
    ['UPI/CHAITANYA K/412300000015/UPI', null],
    ['UPI/SRI MANDIR TRUST/412300000016/UPI', null],
    ['UPI/DINESH KUMAR/412300000017/UPI', null],
  ])('%s → %s', (raw, category) => {
    expect(suggestCategory(raw, -100n)).toBe(category);
  });

  it('counts a name the bank cut short as the same place', () => {
    expect(merchantKey('Sunrise Beverag')).toBe(merchantKey('Sunrise Beverage'));
    expect(merchantKey('R G Mart')).toBe('rgmart');
    expect(merchantKey('Ravi Mart')).not.toBe(merchantKey('Ravi Medicals'));
    expect(merchantKey('—')).toBe('');
    // Cut at different widths, still one place; short names must match exactly.
    expect(samePlace(merchantKey('Ravi Mart Sto'), merchantKey('Ravi Mart Stores'))).toBe(true);
    expect(samePlace('ravi', 'ravimart')).toBe(false);
    expect(samePlace('', '')).toBe(false);
    expect(canonicalKeys(['ravimartsto', 'ravimartstor', 'ashak'])).toEqual(
      new Map([
        ['ravimartstor', 'ravimartstor'],
        ['ravimartsto', 'ravimartstor'],
        ['ashak', 'ashak'],
      ]),
    );
  });

  it('leaves money coming in without a spending category', () => {
    expect(suggestCategory('NEFT CR SWIGGY REFUND', 100n)).toBeNull();
  });
});

describe('spending insights', () => {
  it('knows its months', () => {
    expect(isMonthKey('2026-10')).toBe(true);
    expect(isMonthKey('2026-13')).toBe(false);
    expect(isMonthKey(undefined)).toBe(false);
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthRange('2028-02').to).toBe('2028-02-29');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });

  it('compares with last month only when there was a last month', () => {
    expect(percentChange(150n, 100n)).toBe(50);
    expect(percentChange(50n, 100n)).toBe(-50);
    expect(percentChange(50n, 0n)).toBeNull();
  });

  it('says what the numbers say, and nothing they do not', () => {
    const money = (minor: bigint) => `₹${minor / 100n}`;
    const notes = highlights({
      categories: [
        { name: 'Food', sorted: true, spentMinor: 690000n, previousMinor: 400000n, count: 12 },
        { name: 'Fuel', sorted: true, spentMinor: 200000n, previousMinor: 210000n, count: 2 },
        { name: 'Not sorted', sorted: false, spentMinor: 110000n, previousMinor: 0n, count: 3 },
      ],
      spentMinor: 1000000n,
      incomeMinor: 8500000n,
      previousSpentMinor: 610000n,
      previousLabel: 'September',
      money,
    });
    expect(notes).toEqual([
      'Food took the most: ₹6900, 69% of your spending.',
      'Food is up 73% on September (₹2900 more).',
      '₹75000 left after spending, 88% of what came in.',
      '₹1100 across 3 payments has no category yet.',
    ]);
    expect(
      highlights({
        categories: [],
        spentMinor: 0n,
        incomeMinor: 0n,
        previousSpentMinor: 0n,
        previousLabel: 'September',
        money,
      }),
    ).toEqual([]);
  });
});
