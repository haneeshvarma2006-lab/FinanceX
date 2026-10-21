// Copies the on-phone bill reader (Tesseract, Apache-2.0) into public/ocr, and
// the statement PDF reader into public/pdf, so both are served from this
// origin: nothing is fetched from a CDN at run time,
// and the app's Content Security Policy never has to allow another host.
// Runs before every build; public/ocr and public/pdf are generated, not committed.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const out = join(process.cwd(), 'public', 'ocr');
const tesseract = dirname(require.resolve('tesseract.js/package.json'));
const core = dirname(require.resolve('tesseract.js-core/package.json', { paths: [tesseract] }));
const eng = dirname(require.resolve('@tesseract.js-data/eng/package.json'));

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'core'), { recursive: true });
mkdirSync(join(out, 'lang'), { recursive: true });

cpSync(join(tesseract, 'dist', 'worker.min.js'), join(out, 'worker.min.js'));
// The worker picks one of these per device (SIMD or not; LSTM engine only).
for (const file of [
  'tesseract-core.wasm.js',
  'tesseract-core-simd.wasm.js',
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-relaxedsimd.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm.js',
]) {
  cpSync(join(core, file), join(out, 'core', file));
}
// "best_int": the accurate LSTM model, quantised to about 3 MB.
cpSync(join(eng, '4.0.0_best_int', 'eng.traineddata.gz'), join(out, 'lang', 'eng.traineddata.gz'));

// The statement PDF reader (PDF.js, Apache-2.0): its worker and the
// character maps some bank PDFs need before they give back their text.
const pdfjs = dirname(require.resolve('pdfjs-dist/package.json'));
const pdfOut = join(process.cwd(), 'public', 'pdf');
rmSync(pdfOut, { recursive: true, force: true });
mkdirSync(pdfOut, { recursive: true });
// The legacy worker, to match the legacy build the page loads.
cpSync(join(pdfjs, 'legacy', 'build', 'pdf.worker.min.mjs'), join(pdfOut, 'pdf.worker.min.mjs'));
cpSync(join(pdfjs, 'cmaps'), join(pdfOut, 'cmaps'), { recursive: true });

process.stdout.write('OCR and PDF assets copied to public/ocr and public/pdf\n');
