import { describe, expect, it } from 'vitest';
import { detectMonthly, type Payment } from '@/modules/finance/detect-monthly';
import {
  csvCell,
  ledgerFilter,
  ledgerParamsSchema,
  ledgerQuery,
  toCsv,
} from '@/modules/finance/ledger';

const ID = '0123456789abcdef0123456789abcdef0123';

describe('ledger filters from the address bar', () => {
  it('keeps what is valid and drops what is not', () => {
    const params = ledgerParamsSchema.parse({
      q: '  swiggy  ',
      month: '2026-09',
      category: 'none',
      account: ID,
      direction: 'out',
    });
    expect(params).toEqual({
      q: 'swiggy',
      month: '2026-09',
      category: 'none',
      account: ID,
      direction: 'out',
    });
    expect(ledgerFilter(params)).toEqual({
      search: 'swiggy',
      from: '2026-09-01',
      to: '2026-09-30',
      categoryId: 'none',
      accountId: ID,
      direction: 'out',
    });

    const junk = ledgerParamsSchema.parse({
      q: 'x'.repeat(200),
      month: '2026-13',
      category: "1' or 1=1",
      account: 'nope',
      direction: 'sideways',
    });
    expect(junk).toEqual({
      q: undefined,
      month: undefined,
      category: undefined,
      account: undefined,
      direction: undefined,
    });
    expect(ledgerFilter(junk)).toEqual({
      search: undefined,
      from: undefined,
      to: undefined,
      categoryId: undefined,
      accountId: undefined,
      direction: undefined,
    });
  });

  it('writes the same filters back as a query string', () => {
    expect(ledgerQuery({ q: 'rent & bills', month: '2026-09' })).toBe(
      '?q=rent+%26+bills&month=2026-09',
    );
    expect(ledgerQuery({})).toBe('');
  });
});

describe('CSV export', () => {
  it('quotes what needs quoting', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('Sharma, Ravi')).toBe('"Sharma, Ravi"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
  });

  it('never lets a narration run as a spreadsheet formula', () => {
    expect(csvCell('=HYPERLINK("http://evil","x")')).toBe(`"'=HYPERLINK(""http://evil"",""x"")"`);
    expect(csvCell('+91 98')).toBe("'+91 98");
    expect(csvCell('-cmd')).toBe("'-cmd");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    // Amounts are numbers, and a minus there is just a minus.
    expect(csvCell('-486.00', 'number')).toBe('-486.00');
  });

  it('writes a header and signed amounts, line by line', () => {
    const csv = toCsv([
      {
        occurredOn: '2026-10-01',
        description: 'Swiggy',
        category: 'Food',
        account: 'Savings',
        kind: 'expense',
        amountMinor: -48600n,
        currency: 'INR',
        notes: 'UPI-SWIGGY-SWIGGY8@YBL',
      },
      {
        occurredOn: '2026-10-03',
        description: 'Salary',
        category: null,
        account: 'Savings',
        kind: 'income',
        amountMinor: 8500000n,
        currency: 'INR',
        notes: null,
      },
    ]);
    expect(csv.split('\r\n')).toEqual([
      'Date,Description,Category,Account,Type,Amount,Currency,Bank line',
      '2026-10-01,Swiggy,Food,Savings,expense,-486.00,INR,UPI-SWIGGY-SWIGGY8@YBL',
      '2026-10-03,Salary,,Savings,income,85000.00,INR,',
      '',
    ]);
  });
});

describe('finding payments that come round every month', () => {
  const pay = (
    occurredOn: string,
    rupees: number,
    description: string,
    extra: Partial<Payment> = {},
  ): Payment => ({
    occurredOn,
    amountMinor: BigInt(-rupees * 100),
    currency: 'INR',
    description,
    accountId: 'acc',
    categoryId: null,
    ...extra,
  });
  const today = '2026-10-24';

  it('finds rent and a subscription, with their usual amount and next date', () => {
    const found = detectMonthly(
      [
        pay('2026-07-05', 15000, 'Ramesh Babu'),
        pay('2026-08-05', 15000, 'Ramesh Bab'),
        pay('2026-09-04', 15000, 'Ramesh Babu'),
        pay('2026-10-05', 15000, 'Ramesh Babu', { categoryId: 'rent' }),
        pay('2026-08-12', 649, 'Netflix'),
        pay('2026-09-12', 649, 'Netflix'),
        pay('2026-10-12', 649, 'Netflix'),
      ],
      { today, trackedNames: [] },
    );
    expect(found).toEqual([
      {
        key: 'rameshbabu',
        name: 'Ramesh Babu',
        amountMinor: 1500000n,
        currency: 'INR',
        count: 4,
        lastOn: '2026-10-05',
        nextDueOn: '2026-11-05',
        accountId: 'acc',
        categoryId: 'rent',
      },
      {
        key: 'netflix',
        name: 'Netflix',
        amountMinor: 64900n,
        currency: 'INR',
        count: 3,
        lastOn: '2026-10-12',
        nextDueOn: '2026-11-12',
        accountId: 'acc',
        categoryId: null,
      },
    ]);
  });

  it('allows a bill that changes a little, and an odd one-off at the same place', () => {
    const found = detectMonthly(
      [
        pay('2026-07-20', 799, 'Airtel Postpaid'),
        pay('2026-08-20', 842, 'Airtel Postpaid'),
        pay('2026-09-20', 812, 'Airtel Postpaid'),
        pay('2026-09-25', 3999, 'Airtel Postpaid'),
      ],
      { today, trackedNames: [] },
    );
    expect(found.map((f) => [f.name, f.amountMinor, f.count])).toEqual([
      ['Airtel Postpaid', 81200n, 3],
    ]);
  });

  it('leaves out what only looks regular', () => {
    const weeklyMilk = Array.from({ length: 12 }, (_, i) =>
      pay(new Date(Date.UTC(2026, 6, 1 + i * 7)).toISOString().slice(0, 10), 60, 'Daily Milk'),
    );
    const groceries = [
      pay('2026-07-03', 450, 'Ravi Mart'),
      pay('2026-08-09', 1900, 'Ravi Mart'),
      pay('2026-09-14', 820, 'Ravi Mart'),
    ];
    const twoMonths = [pay('2026-08-01', 999, 'Gym'), pay('2026-09-01', 999, 'Gym')];
    const atm = [
      pay('2026-07-01', 5000, 'ATM cash withdrawal'),
      pay('2026-08-01', 5000, 'ATM cash withdrawal'),
      pay('2026-09-01', 5000, 'ATM cash withdrawal'),
    ];
    const tracked = [
      pay('2026-07-12', 649, 'Netflix'),
      pay('2026-08-12', 649, 'Netflix'),
      pay('2026-09-12', 649, 'Netflix'),
    ];
    expect(
      detectMonthly([...weeklyMilk, ...groceries, ...twoMonths, ...atm, ...tracked], {
        today,
        trackedNames: ['Netflix'],
      }),
    ).toEqual([]);
  });

  it('dates the next one from today when the last was a while ago', () => {
    const [found] = detectMonthly(
      [
        pay('2026-05-03', 2000, 'Coaching Classes'),
        pay('2026-06-03', 2000, 'Coaching Classes'),
        pay('2026-07-03', 2000, 'Coaching Classes'),
      ],
      { today, trackedNames: [] },
    );
    expect(found?.nextDueOn).toBe('2026-11-03');
  });
});
