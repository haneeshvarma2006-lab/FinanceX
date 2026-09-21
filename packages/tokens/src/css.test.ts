import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { generateCss } from './css';
import { dark, light } from './index';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(here, '__fixtures__/globals-before.css');
const GENERATED = resolve(here, '../../../src/app/tokens.generated.css');

/**
 * A deliberately small CSS reader. It only has to understand the shape these
 * two files are in — flat blocks of `name: value;` — and comparing parsed
 * declarations rather than text is the point: the generated file is formatted
 * by its generator, the fixture by Prettier, and neither difference matters.
 */
function declarationsByScope(css: string): Map<string, Map<string, string>> {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const scopes = new Map<string, Map<string, string>>();

  for (const match of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const rawSelector = match[1] ?? '';
    const body = match[2] ?? '';
    // Everything since the previous `}` is captured, which for the first block
    // includes the `@import` line above it; the selector is the last statement.
    const selector = (rawSelector.split(';').at(-1) ?? '')
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/"/g, "'");
    const scope = scopes.get(selector) ?? new Map<string, string>();

    for (const statement of body.split(';')) {
      const separator = statement.indexOf(':');
      if (separator === -1) continue;
      const name = statement.slice(0, separator).trim();
      const value = statement
        .slice(separator + 1)
        .trim()
        .replace(/\s+/g, ' ');
      if (!name) continue;
      scope.set(name, value);
    }

    scopes.set(selector, scope);
  }

  return scopes;
}

function scope(css: string, selector: string): Map<string, string> {
  const found = declarationsByScope(css).get(selector);
  if (!found) throw new Error(`no ${selector} block found`);
  return found;
}

function sorted(map: Map<string, string>): [string, string][] {
  return [...map].sort(([a], [b]) => a.localeCompare(b));
}

const before = readFileSync(FIXTURE, 'utf8');
const generated = generateCss();

/**
 * The extraction's whole claim is that it changed no pixels. These compare the
 * generated sheet against a verbatim copy of `globals.css` as it stood before
 * the tokens moved into this package, so the claim is checked rather than
 * asserted.
 *
 * The comparison is one-directional on purpose. Adding a token is ordinary
 * work and must not fail here. Changing or removing one that the original
 * design system defined is not: it fails until someone updates the fixture,
 * which puts the before and after of a design decision in the diff where a
 * reviewer will see it.
 */
describe('generated CSS preserves the hand-written design system', () => {
  it.each([':root', ":root[data-theme='light']", '@theme', '@theme inline'])(
    'keeps every %s declaration at its original value',
    (selector) => {
      const original = scope(before, selector);
      const now = scope(generated, selector);

      expect(original.size).toBeGreaterThan(2);
      for (const [name, value] of sorted(original)) {
        expect(now.get(name), `${selector} { ${name} }`).toBe(value);
      }
    },
  );

  it('covers the whole original system, not a handful of tokens', () => {
    const originalNames = [...scope(before, ':root').keys(), ...scope(before, '@theme').keys()];

    // Guards the loops above against passing because the fixture went missing
    // or the parser silently returned almost nothing.
    // The fixture is frozen, so this count is exact: 60 declarations across
    // the primitives and the dark semantic layer.
    expect(originalNames.length).toBe(60);
  });
});

describe('the checked-in sheet', () => {
  it('matches what the generator produces', () => {
    // Fails when someone edits a token without re-running `build:css`, or
    // edits the generated file by hand.
    expect(readFileSync(GENERATED, 'utf8')).toBe(generated);
  });

  it('has balanced braces', () => {
    const opens = (generated.match(/\{/g) ?? []).length;
    const closes = (generated.match(/\}/g) ?? []).length;
    expect(opens).toBe(closes);
    expect(opens).toBeGreaterThan(0);
  });
});

describe('themes', () => {
  it('define the same token set, so neither is half-built', () => {
    expect(Object.keys(light).sort()).toEqual(Object.keys(dark).sort());
  });

  it('use no colour format but OKLCH', () => {
    for (const [name, value] of [...Object.entries(dark), ...Object.entries(light)]) {
      expect(value, name).toMatch(/^oklch\(/);
    }
  });
});
