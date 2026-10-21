// Builds the sample statement PDFs the PDF import is tested against.
//
// Every name, number and transaction here is invented, and every page says
// so. The layouts follow the column headings Indian banks commonly print, so
// the reader is exercised on realistic shapes, not on any real statement.
//
//   node tests/fixtures/statements/generate.mjs
//
// Needs Playwright's Chromium. The locked copy is made separately with
// encrypt.py, since a browser cannot add a PDF password.
import { chromium } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const style = `
  body { font: 10px Arial, sans-serif; margin: 24px; color: #111; }
  h1 { font-size: 15px; margin: 0 0 4px; }
  p { margin: 0 0 10px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td { border-bottom: 1px solid #ccc; padding: 4px 5px; vertical-align: top; text-align: left; }
  th { background: #eee; }
  .n { text-align: right; }
  .page { page-break-after: always; }
  footer { margin-top: 14px; font-size: 9px; color: #555; }
`;

function doc(title, pages, footer) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${style}</style></head><body>
    ${pages.map((p, i) => `<section class="${i < pages.length - 1 ? 'page' : ''}">${p}</section>`).join('')}
    <footer>${footer}</footer></body></html>`;
}

const notice = '<p>SAMPLE BANK · TEST FIXTURE · All data invented for automated tests.</p>';

// Savings account, two pages, header repeated, narrations that wrap.
const savingsHead = `<tr><th style="width:11%">Date</th><th style="width:33%">Narration</th><th style="width:13%">Chq./Ref.No.</th><th style="width:9%">Value Dt</th><th class="n" style="width:11%">Withdrawal Amt.</th><th class="n" style="width:11%">Deposit Amt.</th><th class="n" style="width:12%">Closing Balance</th></tr>`;
const savingsRows1 = [
  [
    '01/10/26',
    'UPI-SWIGGY-SWIGGY8@YBL-YESB0YBLUPI-412345678901-PAYMENT FROM PHONE',
    '0000412345678901',
    '01/10/26',
    '486.00',
    '',
    '49,514.00',
  ],
  [
    '02/10/26',
    'UPI-HPCL PETROL PUMP-HPCLPUMP@ICICI-ICIC0DC0099-427700000001-UPI',
    '0000427700000001',
    '02/10/26',
    '2,000.00',
    '',
    '47,514.00',
  ],
  [
    '03/10/26',
    'NEFT CR-SAMP0000001-EXAMPLE TECH PVT LTD-SALARY OCT 2026',
    'SAMPN26276000001',
    '03/10/26',
    '',
    '85,000.00',
    '1,32,514.00',
  ],
  [
    '05/10/26',
    'POS 512345XXXXXX1234 AMAZON PAY INDIA',
    '0000000000000005',
    '05/10/26',
    '3,299.00',
    '',
    '1,29,215.00',
  ],
];
const savingsRows2 = [
  [
    '07/10/26',
    'UPI-RAHUL SAMPLE-RAHUL.SAMPLE99@OKAXIS-UTIB0000001-428000000002-RENT OCT',
    '0000428000000002',
    '07/10/26',
    '15,000.00',
    '',
    '1,14,215.00',
  ],
  [
    '09/10/26',
    'NWD-512345XXXXXX1234-SAMP0001-BANGALORE',
    '0000000000000009',
    '09/10/26',
    '5,000.00',
    '',
    '1,09,215.00',
  ],
  [
    '12/10/26',
    'UPI-CROSSWORD BOOKSTORES-CROSSWORD@HDFCBANK-HDFC0000001-428500000003-BOOKS',
    '0000428500000003',
    '12/10/26',
    '1,150.00',
    '',
    '1,08,065.00',
  ],
];
const savingsTable = (rows) =>
  `<table>${savingsHead}${rows.map((r) => `<tr>${r.map((c, i) => `<td class="${i >= 4 ? 'n' : ''}">${c}</td>`).join('')}</tr>`).join('')}</table>`;

const savings = doc(
  'Savings',
  [
    `<h1>Sample Bank · Statement of account</h1>${notice}<p>Account 50100000000000 · 01/10/26 to 31/10/26</p>${savingsTable(savingsRows1)}<footer>Page 1 of 2</footer>`,
    `${savingsTable(savingsRows2)}<p style="margin-top:10px">STATEMENT SUMMARY</p><p>Opening Balance 50,000.00 · Dr Count 6 · Cr Count 1 · Closing Bal 1,08,065.00</p>`,
  ],
  'This is a computer generated statement. Page 2 of 2',
);

// Second layout: named-month dates, debit and credit columns, value date first.
const sbiHead = `<tr><th style="width:12%">Txn Date</th><th style="width:12%">Value Date</th><th style="width:36%">Description</th><th style="width:14%">Ref No./Cheque No.</th><th class="n" style="width:9%">Debit</th><th class="n" style="width:8%">Credit</th><th class="n" style="width:9%">Balance</th></tr>`;
const sbiRows = [
  [
    '1 Oct 2026',
    '1 Oct 2026',
    'TO TRANSFER-UPI/DR/412300000011/ZEPTO/YESB/zepto@ybl/Groceries--',
    'TRANSFER TO 4897',
    '642.50',
    '',
    '20,357.50',
  ],
  [
    '4 Oct 2026',
    '4 Oct 2026',
    'TO TRANSFER-UPI/DR/412300000012/NETFLIX/HDFC/netflix@hdfcbank/Pay--',
    'TRANSFER TO 4897',
    '649.00',
    '',
    '19,708.50',
  ],
  [
    '6 Oct 2026',
    '6 Oct 2026',
    'BY TRANSFER-UPI/CR/412300000013/PRIYA S/SBIN/priya.s@oksbi/refund--',
    'TRANSFER FROM 4897',
    '',
    '1,200.00',
    '20,908.50',
  ],
  [
    '8 Oct 2026',
    '8 Oct 2026',
    'TO TRANSFER-UPI/DR/412300000014/APOLLO PHARMACY/ICIC/apollo@icici/Medicine--',
    'TRANSFER TO 4897',
    '385.00',
    '',
    '20,523.50',
  ],
];
const sbi = doc(
  'SBI-like',
  [
    `<h1>Sample Bank · Account statement</h1>${notice}<table>${sbiHead}${sbiRows.map((r) => `<tr>${r.map((c, i) => `<td class="${i >= 4 ? 'n' : ''}">${c}</td>`).join('')}</tr>`).join('')}</table>`,
  ],
  'Page 1 of 1',
);

// Card statement: one amount column and a separate Dr/Cr column.
const cardHead = `<tr><th style="width:14%">Date</th><th style="width:58%">Transaction Details</th><th class="n" style="width:18%">Amount (Rs.)</th><th style="width:10%">Dr/Cr</th></tr>`;
const cardRows = [
  ['02-10-2026', 'MYNTRA DESIGNS PVT LTD BANGALORE', '1,799.00', 'Dr'],
  ['03-10-2026', 'PVR INOX LIMITED MUMBAI', '760.00', 'Dr'],
  ['10-10-2026', 'PAYMENT RECEIVED - THANK YOU', '5,000.00', 'Cr'],
  ['14-10-2026', 'MAKEMYTRIP INDIA PVT LTD', '4,250.00', 'Dr'],
];
const card = doc(
  'Card',
  [
    `<h1>Sample Bank · Credit card statement</h1>${notice}<table>${cardHead}${cardRows.map((r) => `<tr>${r.map((c, i) => `<td class="${i === 2 ? 'n' : ''}">${c}</td>`).join('')}</tr>`).join('')}</table>`,
  ],
  'Page 1 of 1',
);

// A preinstalled Chromium can be named with CHROMIUM_PATH.
// The same account with centred headings, as many banks print them.
const centred = savings.replace('</style>', 'th { text-align: center !important; }</style>');

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const page = await browser.newPage();
for (const [name, html] of [
  ['savings', savings],
  ['centred', centred],
  ['debit-credit', sbi],
  ['card', card],
]) {
  await page.setContent(html);
  await page.pdf({ path: join(here, `${name}.pdf`), format: 'A4', printBackground: true });
}
await browser.close();
process.stdout.write('Sample statements written\n');
