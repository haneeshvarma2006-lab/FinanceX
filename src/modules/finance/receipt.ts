import { toDecimalString, type Currency } from '@nestedflow/domain/money';
import { parseStatementAmount, parseStatementDate } from './statement';

/**
 * Turning the text read off a bill into an expense: the total, the date and
 * the shop.
 *
 * The text comes from Tesseract running on the user's own phone, so this is
 * deliberately plain: keyword rules, not a model. It never guesses silently —
 * every field it fills is shown for the user to check, and a field it is not
 * sure of is left empty rather than filled with the biggest number in sight.
 *
 * Amounts go straight from text to integer minor units; never a float.
 */

export type ReceiptGuess = {
  /** Positive minor units, or null when no total could be found. */
  totalMinor: bigint | null;
  /** The total as typed into a form, e.g. "1234.50". */
  total: string | null;
  /** How the total was found: a labelled grand total, a plain "total", or a ₹ amount. */
  confidence: 'high' | 'medium' | 'low' | 'none';
  /** YYYY-MM-DD, or null. */
  date: string | null;
  merchant: string | null;
  /** A category name to look for among the user's own (Fuel, Food, ...). */
  categoryHint: string | null;
};

/** Labels that name the amount actually paid, strongest first. */
const GRAND = [
  /grand\s*total/i,
  /net\s*(amount|payable|total|amt)/i,
  /(amount|amt)\s*(payable|paid|due)/i,
  /total\s*(payable|amount|amt|due|paid)/i,
  /bill\s*(amount|amt|total)/i,
  /(invoice|order)\s*total/i,
  /to\s*pay/i,
];
const TOTAL = /\btotal\b/i;
const AMOUNT = /\b(amount|amt)\b/i;
/** Lines that look like a total but are not the amount paid. */
const NOT_THE_TOTAL =
  /sub\s*-?\s*total|total\s*(qty|quantity|items?|savings?|saved|discount|tax|gst|cgst|sgst|mrp)|you\s*saved|in\s*words|round(ed)?\s*off|tax\s*amount|gst\s*amount|cash\s*tendered|change\s*due|balance\s*due/i;

/** Dates, times, phone and reference numbers: digits that are never the total. */
const NOISE = [
  /\b\d{1,4}[/\-.]\d{1,2}[/\-.]\d{1,4}\b/g,
  /\b\d{1,2}:\d{2}(:\d{2})?\s*(am|pm)?\b/gi,
  /\b\d{7,}\b/g,
  /\b[0-9A-Z]{15}\b/g, // GSTIN
];

const AMOUNT_IN_LINE =
  /(?:₹|rs\.?|inr)?\s*(\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d+\.\d{1,2}|\d+)(?!\d)/gi;

function amountsIn(line: string, currency: Currency): bigint[] {
  let clean = line;
  for (const pattern of NOISE) clean = clean.replace(pattern, ' ');
  const found: bigint[] = [];
  for (const match of clean.matchAll(AMOUNT_IN_LINE)) {
    try {
      const minor = parseStatementAmount(match[1]!, currency);
      if (minor !== null && minor > 0n) found.push(minor);
    } catch {
      // Not an amount after all (too many decimals for the currency, etc.).
    }
  }
  return found;
}

function hasCurrencyMark(line: string): boolean {
  return /₹|\brs\.?\s*\d|\binr\b/i.test(line);
}

const MAX_SENSIBLE_BILL = 1_000_000_00n; // ₹10,00,000 — beyond that, a misread

function largest(values: readonly bigint[]): bigint | null {
  const sane = values.filter((v) => v <= MAX_SENSIBLE_BILL);
  return sane.length === 0 ? null : sane.reduce((a, b) => (b > a ? b : a));
}

function findTotal(
  lines: readonly string[],
  currency: Currency,
): { minor: bigint; confidence: ReceiptGuess['confidence'] } | null {
  // The amount on a labelled line — or, on bills that print the label and
  // the figure on separate lines, on the line just after it.
  const near = (i: number) => {
    const here = amountsIn(lines[i]!, currency);
    if (here.length > 0) return here[here.length - 1]!;
    const next = lines[i + 1] ? amountsIn(lines[i + 1]!, currency) : [];
    return next[0] ?? null;
  };

  const tiers: [RegExp | RegExp[], ReceiptGuess['confidence']][] = [
    [GRAND, 'high'],
    [TOTAL, 'medium'],
    [AMOUNT, 'medium'],
  ];
  for (const [patterns, confidence] of tiers) {
    const list = Array.isArray(patterns) ? patterns : [patterns];
    const hits: bigint[] = [];
    lines.forEach((line, i) => {
      if (NOT_THE_TOTAL.test(line)) return;
      if (!list.some((p) => p.test(line))) return;
      const value = near(i);
      if (value !== null) hits.push(value);
    });
    // Several labelled totals (before and after tax): the paid one is the largest.
    const best = largest(hits);
    if (best !== null) return { minor: best, confidence };
  }

  // No label at all: only trust amounts marked with a currency sign.
  const marked = lines.filter(hasCurrencyMark).flatMap((l) => amountsIn(l, currency));
  const best = largest(marked);
  return best === null ? null : { minor: best, confidence: 'low' };
}

const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec';

function findDate(text: string, today: string): string | null {
  const earliest = new Date(Date.parse(today) - 400 * 86_400_000).toISOString().slice(0, 10);
  const candidates: string[] = [];

  for (const m of text.matchAll(/\b(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}|\d{4}-\d{2}-\d{2})\b/g)) {
    const iso = parseStatementDate(m[1]!, 'dmy');
    if (iso) candidates.push(iso);
  }
  for (const m of text.matchAll(
    new RegExp(`\\b(\\d{1,2})[\\s\\-/.]*(${MONTHS})[a-z]*[\\s\\-/.,']*(\\d{2,4})\\b`, 'gi'),
  )) {
    const iso = parseStatementDate(`${m[1]} ${m[2]} ${m[3]}`, 'dmy');
    if (iso) candidates.push(iso);
  }
  // "Oct 12, 2026"
  for (const m of text.matchAll(
    new RegExp(`\\b(${MONTHS})[a-z]*\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})\\b`, 'gi'),
  )) {
    const iso = parseStatementDate(`${m[2]} ${m[1]} ${m[3]}`, 'dmy');
    if (iso) candidates.push(iso);
  }

  // A bill is from the past year and not from the future.
  return candidates.find((d) => d <= today && d >= earliest) ?? null;
}

/** Names worth recognising anywhere on the bill, and the kind of spending they are. */
const BRANDS: [RegExp, string, string][] = [
  [/blinkit|grofers/i, 'Blinkit', 'Groceries'],
  [/zepto/i, 'Zepto', 'Groceries'],
  [/swiggy\s*instamart|instamart/i, 'Swiggy Instamart', 'Groceries'],
  [/big\s*basket|bigbasket/i, 'BigBasket', 'Groceries'],
  [/d[\s-]?mart|avenue\s*supermarts/i, 'DMart', 'Groceries'],
  [/reliance\s*(fresh|smart|retail)/i, 'Reliance', 'Groceries'],
  [/more\s*(retail|supermarket)/i, 'More', 'Groceries'],
  [/swiggy/i, 'Swiggy', 'Food'],
  [/zomato/i, 'Zomato', 'Food'],
  [/starbucks/i, 'Starbucks', 'Food'],
  [/mc\s*donald|mcdonald/i, "McDonald's", 'Food'],
  [/domino/i, "Domino's", 'Food'],
  [/kfc\b/i, 'KFC', 'Food'],
  [/amazon/i, 'Amazon', 'Shopping'],
  [/flipkart/i, 'Flipkart', 'Shopping'],
  [/myntra/i, 'Myntra', 'Shopping'],
  [/ajio/i, 'AJIO', 'Shopping'],
  [/indian\s*oil|iocl/i, 'Indian Oil', 'Fuel'],
  [/bharat\s*petroleum|bpcl/i, 'Bharat Petroleum', 'Fuel'],
  [/hindustan\s*petroleum|hpcl/i, 'HP Petrol', 'Fuel'],
  [/shell/i, 'Shell', 'Fuel'],
  [/nayara/i, 'Nayara', 'Fuel'],
  [/uber/i, 'Uber', 'Transport'],
  [/\bola\b/i, 'Ola', 'Transport'],
  [/rapido/i, 'Rapido', 'Transport'],
  [/irctc/i, 'IRCTC', 'Travel'],
  [/apollo\s*pharmacy/i, 'Apollo Pharmacy', 'Health'],
  [/medplus/i, 'MedPlus', 'Health'],
];

/**
 * Order matters: a stay is recognised by stay words before food words, since
 * a hotel folio lists food too. "Hotel" alone is not a stay word — in much of
 * India it names a restaurant.
 */
const KIND_WORDS: [RegExp, string][] = [
  [/petrol|diesel|fuel|litres?|ltrs?\b|nozzle|pump/i, 'Fuel'],
  [/resort|lodge|folio|room\s*(no|rent|charges|tariff)|check[\s-]?(in|out)|\bnights?\b/i, 'Travel'],
  [/restaurant|cafe|café|dine|kitchen|food|biryani|pizza|bar\s*&|meals?|hotel/i, 'Food'],
  [/grocer|supermarket|kirana|mart\b/i, 'Groceries'],
  [/pharma|chemist|medical|clinic|hospital/i, 'Health'],
  [/electricity|water\s*bill|broadband|recharge|postpaid/i, 'Bills'],
];

/** Header lines that are about the document, not the shop. */
const NOT_A_NAME =
  /tax\s*invoice|invoice|receipt|cash\s*memo|bill\s*(no|of)|gst|phone|ph\b|tel|mob|www|http|@|address|date|order|table|token|kot|welcome|thank/i;

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .replace(/\s+/g, ' ')
    .trim();
}

function findMerchant(
  lines: readonly string[],
  text: string,
): { name: string | null; hint: string | null } {
  for (const [pattern, name, hint] of BRANDS) {
    if (pattern.test(text)) return { name, hint };
  }
  const hint = KIND_WORDS.find(([pattern]) => pattern.test(text))?.[1] ?? null;
  for (const line of lines.slice(0, 6)) {
    const letters = line.replace(/[^A-Za-z]/g, '').length;
    if (letters < 3 || letters < line.replace(/\s/g, '').length * 0.6) continue;
    if (NOT_A_NAME.test(line)) continue;
    return { name: titleCase(line).slice(0, 60), hint };
  }
  return { name: null, hint };
}

export function readReceipt(text: string, currency: Currency, today: string): ReceiptGuess {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0);

  const total = findTotal(lines, currency);
  const { name, hint } = findMerchant(lines, text);

  return {
    totalMinor: total?.minor ?? null,
    total: total ? toDecimalString(total.minor, currency) : null,
    confidence: total?.confidence ?? 'none',
    date: findDate(text, today),
    merchant: name,
    categoryHint: hint,
  };
}
