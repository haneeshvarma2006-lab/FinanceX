import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateCss } from './css';

/**
 * Write the generated sheet the web app imports.
 *
 * Checked in rather than produced during the build: the app must be buildable
 * from a clean clone with no extra step, and a diff on this file makes a token
 * change visible in review rather than invisible inside a build artefact.
 */

const here = dirname(fileURLToPath(import.meta.url));
export const OUTPUT_PATH = resolve(here, '../../../src/app/tokens.generated.css');

export function emit(): string {
  const css = generateCss();
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, css, 'utf8');
  return OUTPUT_PATH;
}

// eslint-disable-next-line no-console -- this file is a build script, not app code
console.log(`tokens: wrote ${emit()}`);
