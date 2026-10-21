import { tableFromPdf, type PdfTable, type PdfText } from '@/modules/finance/statement-pdf';

/**
 * Reading a statement PDF in the browser.
 *
 * The file never leaves the device: PDF.js (Mozilla, Apache-2.0) is served
 * from this site and reads the text here, and only the rows the person
 * chooses to import are sent. A password, for the statements banks lock
 * with a date of birth or customer ID, is used to open the file and then
 * forgotten; it is never stored or sent anywhere.
 */

export const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_PAGES = 60;

export type PdfRead =
  | { ok: true; table: PdfTable; pages: number }
  | { ok: false; reason: 'password' | 'wrong-password' | 'no-text' | 'no-table' | 'unreadable' };

export async function readStatementPdf(file: File, password?: string): Promise<PdfRead> {
  // The legacy build: the standard one relies on JavaScript features newer
  // than many phones' browsers (Math.sumPrecise, for one).
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf/pdf.worker.min.mjs';

  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    password,
    // Bank PDFs often use fonts that need character maps to give back text.
    cMapUrl: '/pdf/cmaps/',
    cMapPacked: true,
    // Reading text needs no image decoders and no fonts installed.
    useWasm: false,
    disableFontFace: true,
  });
  let doc: Awaited<typeof task.promise>;
  try {
    doc = await task.promise;
  } catch (error) {
    void task.destroy();
    if (error instanceof Error && error.name === 'PasswordException') {
      const code = (error as Error & { code?: number }).code;
      return { ok: false, reason: code === 2 ? 'wrong-password' : 'password' };
    }
    return { ok: false, reason: 'unreadable' };
  }

  try {
    const pages: PdfText[][] = [];
    let anyText = false;
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n += 1) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const items: PdfText[] = [];
      for (const item of content.items) {
        if (!('str' in item) || item.str.trim() === '') continue;
        anyText = true;
        const [, , c, d, x, y] = item.transform as number[];
        items.push({
          text: item.str,
          x: x!,
          y: y!,
          width: item.width,
          height: item.height || Math.hypot(c!, d!),
        });
      }
      pages.push(items);
      page.cleanup();
    }
    if (!anyText) return { ok: false, reason: 'no-text' };
    const table = tableFromPdf(pages);
    return table ? { ok: true, table, pages: doc.numPages } : { ok: false, reason: 'no-table' };
  } catch {
    return { ok: false, reason: 'unreadable' };
  } finally {
    void task.destroy();
  }
}
