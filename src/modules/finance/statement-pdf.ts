import { foldDrCrColumn, looksLikeHeader, parseStatementDate } from './statement';

/**
 * Bank statement PDFs, turned back into the table they were printed from.
 *
 * A PDF has no rows or columns, only pieces of text drawn at positions. The
 * statement's own header line ("Date · Narration · Withdrawal · Deposit ·
 * Balance") names the columns, and the empty vertical gutters between the
 * rows below it say where one column ends and the next begins — whether the
 * bank centres its headings, aligns them left, or right-aligns its amounts.
 * Lines are grouped into transactions by their date, and a narration that
 * wraps onto a second line is joined back onto its transaction.
 *
 * The result is the same header-and-rows shape a CSV export gives, so a PDF
 * goes through the same column check, preview and duplicate detection as a
 * CSV does. Pure: the browser feeds it what the PDF library read, and tests
 * feed it positions directly.
 */

/** One piece of text as the PDF draws it. `y` grows upwards, as in PDF space. */
export type PdfText = { text: string; x: number; y: number; width: number; height: number };

type Line = { items: PdfText[]; y: number; height: number };
type Phrase = { x0: number; x1: number; name: string };

export type PdfTable = { header: string[]; body: string[][] };

/** Text on one baseline, left to right; superscripts and jitter share a line. */
function linesOf(page: readonly PdfText[]): Line[] {
  const items = page.filter((i) => i.text.trim() !== '').sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Line[] = [];
  for (const item of items) {
    const line = lines[lines.length - 1];
    const tolerance = Math.max(2, (line?.height ?? item.height) * 0.45);
    if (line && Math.abs(line.y - item.y) <= tolerance) {
      line.items.push(item);
      line.height = Math.max(line.height, item.height);
    } else {
      lines.push({ items: [item], y: item.y, height: item.height || 8 });
    }
  }
  for (const line of lines) line.items.sort((a, b) => a.x - b.x);
  return lines;
}

/**
 * Pieces close enough to be one phrase: "Withdrawal" and "Amt." with a
 * space between them, not two columns. Columns sit further apart than words.
 */
function phrases(line: Line): Phrase[] {
  const out: Phrase[] = [];
  for (const item of line.items) {
    const last = out[out.length - 1];
    const gap = last ? item.x - last.x1 : Infinity;
    if (last && gap <= Math.max(3, item.height * 0.9)) {
      last.name = `${last.name}${gap > item.height * 0.15 ? ' ' : ''}${item.text.trim()}`;
      last.x1 = Math.max(last.x1, item.x + item.width);
    } else {
      out.push({ x0: item.x, x1: item.x + item.width, name: item.text.trim() });
    }
  }
  return out;
}

/** Where one heading's column ends: halfway to the next heading. */
function midBounds(heads: readonly Phrase[]): number[] {
  return heads.slice(1).map((next, i) => (heads[i]!.x1 + next.x0) / 2);
}

/**
 * Where each column really ends: in the gap between two headings, the
 * stretch that the fewest rows below have text in. A wide narration under a
 * short "Narration" heading fills most of that gap, so the boundary lands
 * just before the next column's text, not halfway between two words.
 */
function gutterBounds(heads: readonly Phrase[], below: readonly Line[]): number[] {
  const items = below.flatMap((l) => l.items);
  return heads.slice(1).map((next, i) => {
    const from = Math.ceil(heads[i]!.x1);
    const to = Math.floor(next.x0);
    if (to - from < 2) return (heads[i]!.x1 + next.x0) / 2;

    const counts: number[] = [];
    for (let x = from; x <= to; x += 1) {
      counts.push(items.filter((t) => t.x < x + 0.5 && t.x + t.width > x - 0.5).length);
    }
    const least = Math.min(...counts);
    // The widest stretch at that lowest count, and its middle.
    let best: [number, number] | null = null;
    let start = -1;
    counts.forEach((count, k) => {
      if (count !== least) {
        start = -1;
        return;
      }
      if (start < 0) start = k;
      if (!best || k - start > best[1] - best[0]) best = [start, k];
    });
    const [a, b]: [number, number] = best ?? [0, counts.length - 1];
    return from + (a + b) / 2;
  });
}

function columnAt(bounds: readonly number[], x: number): number {
  const index = bounds.findIndex((b) => x < b);
  return index < 0 ? bounds.length : index;
}

/**
 * A run of text that crosses a column boundary ("SAMPN2627 03/10/26", a
 * reference and a date drawn as one string) is split into words, each placed
 * by where it would sit in the run.
 */
function wordsOf(bounds: readonly number[], item: PdfText): PdfText[] {
  const crosses = bounds.some((b) => item.x < b - 1 && item.x + item.width > b + 1);
  if (!crosses || !item.text.trim().includes(' ')) return [item];
  const perChar = item.width / Math.max(1, item.text.length);
  const words: PdfText[] = [];
  const pattern = /\S+/g;
  for (let match = pattern.exec(item.text); match; match = pattern.exec(item.text)) {
    words.push({
      ...item,
      text: match[0],
      x: item.x + match.index * perChar,
      width: match[0].length * perChar,
    });
  }
  return words;
}

function cellsOf(bounds: readonly number[], line: Line): string[] {
  const cells = Array.from({ length: bounds.length + 1 }, () => [] as string[]);
  for (const item of line.items) {
    for (const word of wordsOf(bounds, item)) {
      cells[columnAt(bounds, word.x + word.width / 2)]!.push(word.text.trim());
    }
  }
  return cells.map((parts) => parts.join(' ').replace(/\s+/g, ' ').trim());
}

/** A wrapped line rejoined: no space after a break inside "YESB-4123" or "UPI/". */
function joinWrapped(before: string, after: string): string {
  if (!before) return after;
  return /[-/]$/.test(before) ? `${before}${after}` : `${before} ${after}`;
}

const AMOUNT = /\d[\d,]*\.\d{2}\b/;

function isDate(cell: string): boolean {
  const words = cell.split(' ');
  return [cell, words.slice(0, 3).join(' '), words[0] ?? ''].some(
    (candidate) => parseStatementDate(candidate, 'dmy') !== null,
  );
}

/** Lines that end the table on a page: the summary block and the footer. */
const TABLE_END =
  /^(statement summary|opening balance|closing balance|total|grand total|page \d+|\*{2,}|this is a (computer|system)[- ]generated)/i;

/**
 * The statement's transactions as a table, or null when no page has a
 * header line to read the columns from.
 */
export function tableFromPdf(pages: readonly (readonly PdfText[])[]): PdfTable | null {
  let header: string[] | null = null;
  let bounds: number[] | null = null;
  let dateColumn = 0;
  const body: string[][] = [];

  for (const page of pages) {
    const lines = linesOf(page);
    let current: string[] | null = null;
    let inTable = false;
    let last: Line | null = null;

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]!;
      const heads = phrases(line);

      if (looksLikeHeader(heads.map((h) => h.name))) {
        // A heading split over two lines ("Withdrawal" / "Amt.") gets its
        // second half from the line below, when that line is all words.
        const next = lines[i + 1];
        if (
          next &&
          line.y - next.y <= Math.max(line.height, next.height) * 1.8 &&
          !next.items.some((t) => AMOUNT.test(t.text) || isDate(t.text))
        ) {
          cellsOf(midBounds(heads), next).forEach((part, k) => {
            if (part) heads[k]!.name = `${heads[k]!.name} ${part}`;
          });
          i += 1;
        }
        bounds = gutterBounds(heads, lines.slice(i + 1));
        header ??= heads.map((h) => h.name);
        dateColumn = Math.max(
          0,
          heads.findIndex((h) => /date/i.test(h.name) && !/value/i.test(h.name)),
        );
        current = null;
        inTable = true;
        last = line;
        continue;
      }
      if (!bounds || !header) continue;

      const text = line.items
        .map((t) => t.text)
        .join(' ')
        .trim();
      if (TABLE_END.test(text)) {
        current = null;
        inTable = false;
        continue;
      }

      const cells = cellsOf(bounds, line);
      const close = last !== null && last.y - line.y <= Math.max(last.height, line.height) * 2.2;
      // Later pages often have no header of their own: the first dated line
      // starts the table again under the columns already known.
      if (isDate(cells[dateColumn] ?? '') && cells.some((c) => AMOUNT.test(c))) {
        // Padded to the header's width so every row has every column.
        current = header.map((_, k) => cells[k] ?? '');
        body.push(current);
        inTable = true;
      } else if (current && inTable && close && !cells.some((c) => AMOUNT.test(c))) {
        // A wrapped narration: each piece rejoins the cell it sits under.
        const row = current;
        cells.forEach((cell, k) => {
          if (cell && k !== dateColumn) row[k] = joinWrapped(row[k] ?? '', cell);
        });
      } else {
        current = null;
      }
      last = line;
    }
  }

  if (!header || body.length === 0) return null;
  return foldDrCrColumn(header, body);
}
