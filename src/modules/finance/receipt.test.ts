import { describe, expect, it } from 'vitest';
import { readReceipt } from './receipt';

/**
 * Bill text in the shapes Tesseract returns for common Indian receipts.
 * Synthetic: written to the layout of each kind of bill, not copied from a
 * real one. Real-photo accuracy is measured separately, on real bills.
 */

const TODAY = '2026-10-12';
const read = (text: string) => readReceipt(text, 'INR', TODAY);

describe('readReceipt', () => {
  it('reads a restaurant bill: grand total over subtotal, tax and savings', () => {
    const guess = read(`
      SPICE GARDEN RESTAURANT
      12, MG Road, Bengaluru 560001
      GSTIN: 29ABCDE1234F1Z5
      Ph: 9876543210
      Bill No: 4521   Date: 11/10/2026  Time: 21:42
      Table: 7
      Paneer Tikka        1   320.00
      Butter Naan         4   240.00
      Sub Total               1,560.00
      CGST 2.5%                  39.00
      SGST 2.5%                  39.00
      Round Off                   0.00
      Grand Total         Rs. 1,638.00
      Thank you! Visit again
    `);
    expect(guess).toMatchObject({
      total: '1638.00',
      totalMinor: 163800n,
      confidence: 'high',
      date: '2026-10-11',
      merchant: 'Spice Garden Restaurant',
      categoryHint: 'Food',
    });
  });

  it('reads a fuel pump slip with the amount on its own label', () => {
    const guess = read(`
      INDIAN OIL
      COCO NH-44 SERVICE STATION
      Receipt No: 000231
      Date: 05-10-26 Time: 08:15
      Product: PETROL
      Rate (Rs/L): 102.86
      Volume (L): 4.86
      Amount: 500.00
      Vehicle No: KA01AB1234
    `);
    expect(guess).toMatchObject({
      total: '500.00',
      date: '2026-10-05',
      merchant: 'Indian Oil',
      categoryHint: 'Fuel',
    });
  });

  it('reads a quick-commerce invoice, ignoring "you saved" and item totals', () => {
    const guess = read(`
      Tax Invoice
      blinkit
      Order ID: 2861574409123
      Invoice Date: 12-Oct-2026
      Total Items 6
      Item Total ₹ 486
      You saved ₹ 64
      Delivery charge ₹ 0
      Bill Amount ₹ 422
    `);
    expect(guess).toMatchObject({
      total: '422.00',
      confidence: 'high',
      date: '2026-10-12',
      merchant: 'Blinkit',
      categoryHint: 'Groceries',
    });
  });

  it('reads a marketplace invoice with the figure on the line after its label', () => {
    const guess = read(`
      amazon.in
      Tax Invoice/Bill of Supply/Cash Memo
      Order Date: Oct 8, 2026
      Invoice Number: IN-BLR8-1234567
      Total Amount
      ₹ 2,499.00
      Amount in Words: Two Thousand Four Hundred Ninety-nine only
    `);
    expect(guess).toMatchObject({
      total: '2499.00',
      date: '2026-10-08',
      merchant: 'Amazon',
      categoryHint: 'Shopping',
    });
  });

  it('reads a hotel folio with Indian digit grouping', () => {
    const guess = read(`
      HOTEL SEA BREEZE
      Guest Folio
      Check-in 03/10/2026  Check-out 05/10/2026
      Room Charges 2 nights        9,000.00
      Food & Beverage             1,250.00
      Total                      10,250.00
      GST 12%                     1,230.00
      Net Payable              11,480.00
    `);
    expect(guess).toMatchObject({ total: '11480.00', date: '2026-10-03', categoryHint: 'Travel' });
  });

  it('falls back to a rupee-marked amount, and admits when it found nothing', () => {
    expect(read(`Chai Point\nMasala chai ₹ 40\n₹ 60`)).toMatchObject({
      total: '60.00',
      confidence: 'low',
      merchant: 'Chai Point',
    });
    const blank = read(`smudged photo\nnothing legible 12 34`);
    expect(blank).toMatchObject({ total: null, totalMinor: null, confidence: 'none' });
  });

  it('never takes a phone, order or GST number, or a future date', () => {
    const guess = read(`
      Corner Bakery
      Phone 9876543210  GSTIN 29ABCDE1234F1Z5
      Order 2861574409123
      Date 12/12/2026
      Total 150
    `);
    expect(guess.total).toBe('150.00');
    expect(guess.date).toBeNull(); // December 2026 has not happened yet
  });
});
