// Renders the app icons as PNGs from the logo SVGs in public/.
//
// Phones need raster icons: Android only installs a web app as a real app
// with 192 and 512 pixel PNGs, iPhones read a 180 pixel apple-touch-icon,
// and Android draws a notification's small status-bar icon from a white
// silhouette on transparency. The outputs are committed; run this again
// only when the logo changes.
//
//   CHROMIUM_PATH=/path/to/chromium node scripts/make-icons.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const pub = join(process.cwd(), 'public');
const out = join(pub, 'icons');
mkdirSync(out, { recursive: true });

const icon = readFileSync(join(pub, 'icon.svg'), 'utf8');
const maskable = readFileSync(join(pub, 'icon-maskable.svg'), 'utf8');
// The mark alone, in white: what Android tints for the status bar.
const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <g fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round">
    <rect x="9" y="9" width="46" height="46" rx="13" stroke-width="4"/>
    <rect x="21" y="21" width="22" height="22" rx="7" stroke-width="4"/>
    <path d="M10 47c9 0 12-28 22-28s13 28 22 28" stroke-width="5.5"/>
  </g>
</svg>`;

const renders = [
  ['icon-192.png', icon, 192],
  ['icon-512.png', icon, 512],
  ['maskable-512.png', maskable, 512],
  ['apple-touch-icon.png', maskable, 180],
  ['badge-96.png', badge, 96],
];

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const page = await browser.newPage();
for (const [name, svg, size] of renders) {
  await page.setViewportSize({ width: size, height: size });
  const sized = svg.replace('<svg ', `<svg width="${size}" height="${size}" `);
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:transparent">${sized}</body></html>`,
  );
  await page.screenshot({ path: join(out, name), omitBackground: true });
}
await browser.close();
process.stdout.write(`Icons written to ${out}\n`);
