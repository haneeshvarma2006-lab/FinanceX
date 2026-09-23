import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { glob } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

/**
 * docs/ARCHITECTURE.md claims two invariants are enforced rather than merely
 * intended. ESLint enforces them while someone is editing; these tests assert
 * the same thing in CI, so the claim cannot quietly become false the first time
 * a rule is disabled with an inline comment.
 */

const ROOT = join(import.meta.dirname, '../..');

async function sourceFiles(pattern: string): Promise<string[]> {
  const out: string[] = [];
  for await (const entry of glob(pattern, { cwd: ROOT })) out.push(entry);
  return out;
}

describe('invariant: SQL lives only in the data layer', () => {
  it('has no database import outside repositories, schemas, and lib/db', async () => {
    const files = await sourceFiles('src/**/*.{ts,tsx}');

    const permitted = (f: string) =>
      f.endsWith('/repository.ts') ||
      f.endsWith('/schema.ts') ||
      f.startsWith('src/lib/db/') ||
      f.endsWith('.test.ts');

    const offenders = files.filter((file) => {
      if (permitted(file)) return false;
      const source = readFileSync(join(ROOT, file), 'utf8');
      return (
        /from ['"]drizzle-orm/.test(source) ||
        /from ['"]pg['"]/.test(source) ||
        /from ['"].*lib\/db\/client['"]/.test(source)
      );
    });

    expect(offenders, `These files must go through a repository: ${offenders.join(', ')}`).toEqual(
      [],
    );
  });

  it('builds no SQL by string concatenation', async () => {
    // Only .ts — SQL never belongs in a component, and a UI string like
    // `Delete ${name}` in an aria-label is not SQL. An over-broad guard that
    // cries wolf gets disabled, which is worse than no guard at all.
    const files = await sourceFiles('src/**/*.ts');

    /**
     * A template literal carrying a real SQL statement shape — the keyword
     * plus the clause that must follow it — together with an interpolation,
     * and NOT wrapped in drizzle's sql`` tag, which parameterises its values.
     */
    const statementShapes = [
      /(?<!sql)`[^`]*\bselect\b[^`]*\bfrom\b[^`]*\$\{/is,
      /(?<!sql)`[^`]*\binsert\s+into\b[^`]*\$\{/is,
      /(?<!sql)`[^`]*\bupdate\b[^`]*\bset\b[^`]*\$\{/is,
      /(?<!sql)`[^`]*\bdelete\s+from\b[^`]*\$\{/is,
    ];

    const offenders = files.filter((file) => {
      const source = readFileSync(join(ROOT, file), 'utf8');
      return statementShapes.some((pattern) => pattern.test(source));
    });

    expect(offenders, `Possible SQL string building in: ${offenders.join(', ')}`).toEqual([]);
  });

  it('still catches SQL actually built by concatenation', () => {
    // Guarding the guard: these are what it must reject.
    const shapes = [
      /(?<!sql)`[^`]*\bselect\b[^`]*\bfrom\b[^`]*\$\{/is,
      /(?<!sql)`[^`]*\bdelete\s+from\b[^`]*\$\{/is,
    ];

    const hostile = [
      'const q = `select * from users where id = ${id}`;',
      'await raw(`delete from sessions where token = ${token}`);',
    ];
    for (const sample of hostile) {
      expect(
        shapes.some((p) => p.test(sample)),
        sample,
      ).toBe(true);
    }

    // And these are what it must NOT reject.
    const benign = [
      'aria-label={`Delete ${rule.name}`}',
      'const msg = `Update ${count} items`;',
      'sql`delete from ${table} where id = ${id}`',
    ];
    for (const sample of benign) {
      expect(
        shapes.some((p) => p.test(sample)),
        sample,
      ).toBe(false);
    }
  });
});

describe('invariant: money never touches floating point', () => {
  it('uses no float parsing or float rounding in the money module', () => {
    // The money module now lives in @nestedflow/domain so mobile can share it
    // verbatim; the invariant follows the code rather than the old path.
    const source = readFileSync(join(ROOT, 'packages/domain/src/money/index.ts'), 'utf8');

    expect(source).not.toMatch(/parseFloat/);
    expect(source).not.toMatch(/\.toFixed\(/);
    expect(source).not.toMatch(/Math\.round|Math\.floor|Math\.ceil/);
  });

  it('exposes no money helper that takes or returns a number amount', async () => {
    const source = readFileSync(join(ROOT, 'packages/domain/src/money/index.ts'), 'utf8');

    // ratioToPercent returns a number on purpose (it is a percentage for a
    // progress bar, not an amount); every other export trades in bigint.
    const numericReturns = [...source.matchAll(/export function (\w+)[^)]*\): (\w+)/g)]
      .filter(([, , type]) => type === 'number')
      .map(([, name]) => name);

    expect(numericReturns).toEqual(['exponentOf', 'ratioToPercent']);
  });

  it('has no float arithmetic on amounts anywhere in src', async () => {
    const files = await sourceFiles('{src,packages}/**/*.{ts,tsx}');

    const offenders = files.filter((file) => {
      if (file.endsWith('.test.ts')) return false;
      const source = readFileSync(join(ROOT, file), 'utf8');
      return /parseFloat\s*\(/.test(source);
    });

    expect(offenders, `parseFloat found in: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('invariant: the shared domain package stays portable', () => {
  it('imports no framework, database, or network', async () => {
    const files = await sourceFiles('packages/domain/src/**/*.ts');
    expect(files.length).toBeGreaterThan(5);

    const offenders = files.filter((file) => {
      const source = readFileSync(join(ROOT, file), 'utf8');
      return (
        /from ['"](react|next|react-native)/.test(source) ||
        /from ['"]drizzle-orm/.test(source) ||
        /from ['"]pg['"]/.test(source) ||
        /\bfetch\s*\(/.test(source) ||
        /from ['"]node:(fs|http|https|net)/.test(source) ||
        /from ['"]@\//.test(source)
      );
    });

    expect(
      offenders,
      `@nestedflow/domain must stay pure so every client can share it: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('reads no ambient clock', async () => {
    const files = await sourceFiles('packages/domain/src/**/*.ts');

    const offenders = files.filter((file) => {
      if (file.endsWith('.test.ts')) return false;
      const source = readFileSync(join(ROOT, file), 'utf8');
      // A function needing "now" takes it as an argument, so behaviour is
      // testable at a boundary rather than dependent on when the suite runs.
      return /Date\.now\(\)|new Date\(\s*\)/.test(source);
    });

    expect(offenders, `Pass time in rather than reading it: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('invariant: secrets stay on the server', () => {
  it('keeps env, auth, and security modules out of client components', async () => {
    const files = await sourceFiles('src/**/*.tsx');

    const offenders = files.filter((file) => {
      const source = readFileSync(join(ROOT, file), 'utf8');
      if (!/^['"]use client['"]/m.test(source)) return false;
      return (
        /from ['"]@\/lib\/env['"]/.test(source) ||
        /from ['"]@\/lib\/security\//.test(source) ||
        /from ['"]@\/lib\/auth\//.test(source) ||
        /from ['"]@\/modules\/[^'"]*\/(repository|service)['"]/.test(source)
      );
    });

    expect(
      offenders,
      `Client components must not import server-only modules: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('never writes a password or token into a log call', async () => {
    const files = await sourceFiles('src/**/*.{ts,tsx}');

    const offenders = files.filter((file) => {
      if (file.endsWith('.test.ts')) return false;
      const source = readFileSync(join(ROOT, file), 'utf8');
      return /console\.\w+\([^)]*\b(password|passwordHash|token|secret)\b/i.test(source);
    });

    expect(offenders, `Possible credential logging in: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('invariant: the environment contract is real', () => {
  it('reads no secret directly from process.env outside env.ts', async () => {
    const files = await sourceFiles('src/**/*.{ts,tsx}');

    const offenders = files.filter((file) => {
      if (file === 'src/lib/env.ts' || file.endsWith('.test.ts')) return false;
      const source = readFileSync(join(ROOT, file), 'utf8');
      // NODE_ENV is allowed: it is not a secret and middleware runs before the
      // validated env is available.
      return /process\.env\.(?!NODE_ENV)[A-Z_]+/.test(source);
    });

    expect(
      offenders,
      `Read configuration through getEnv() instead: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('documents every required variable in .env.example', () => {
    const env = readFileSync(join(ROOT, 'src/lib/env.ts'), 'utf8');
    const example = readFileSync(join(ROOT, '.env.example'), 'utf8');

    const declared = [...env.matchAll(/^\s{2}([A-Z][A-Z0-9_]+):/gm)].map(([, name]) => name!);

    expect(declared.length).toBeGreaterThan(3);
    for (const name of declared) {
      if (name === 'NODE_ENV') continue;
      expect(example, `.env.example is missing ${name}`).toContain(name);
    }
  });
});

describe('invariant: relative paths in tests stay inside the repo', () => {
  it('resolves ROOT to the project root', () => {
    expect(relative(ROOT, join(ROOT, 'package.json'))).toBe('package.json');
  });
});

/**
 * Tokens live in `packages/tokens` so the future mobile client can import the
 * same values. That only holds while nobody pastes a value back into the CSS.
 */
describe('invariant: design tokens have exactly one home', () => {
  const globals = () => readFileSync(join(ROOT, 'src/app/globals.css'), 'utf8');

  it('has globals.css consume the generated sheet', () => {
    expect(globals()).toContain("@import './tokens.generated.css'");
  });

  it('declares no colour, radius or motion token by hand in globals.css', () => {
    const body = globals().replace(/\/\*[\s\S]*?\*\//g, '');

    // Not anchored to the start of a line: a declaration squeezed onto one
    // line with its selector is still a declaration. A `var(--x)` reference
    // has no colon after the name, so reading tokens stays allowed.
    const offenders = [...body.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(([, name]) => name!);

    expect(
      offenders,
      `Change packages/tokens/src/index.ts and re-run \`pnpm tokens:build\` instead of declaring: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('keeps the generated sheet out of hand-editing', () => {
    const generated = readFileSync(join(ROOT, 'src/app/tokens.generated.css'), 'utf8');
    expect(generated).toContain('GENERATED FILE — do not edit');
  });

  it('never hard-codes a length in a component', async () => {
    const files = await sourceFiles('src/**/*.{ts,tsx}');

    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(join(ROOT, file), 'utf8');
      // A Tailwind arbitrary value holding a raw length, e.g. `text-[13px]` or
      // `mt-[1.625rem]`. `rounded-[var(--radius-card)]` is how a token is
      // referenced and stays allowed.
      for (const [match] of source.matchAll(/\[[0-9][0-9.]*(?:px|rem|em)\]/g)) {
        offenders.push(`${file}: ${match}`);
      }
    }

    expect(
      offenders,
      `Add a token in packages/tokens instead of a one-off length: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('never hard-codes a colour outside the token package', async () => {
    const files = await sourceFiles('src/**/*.{ts,tsx,css}');

    const offenders = files.filter((file) => {
      if (file === 'src/app/tokens.generated.css') return false;
      const source = readFileSync(join(ROOT, file), 'utf8');
      // A six- or three-digit hex colour in a style position. Tailwind classes
      // and CSS variables are the supported way to reach a colour.
      return /(?:color|background|border|fill|stroke)[^;:\n]*:\s*#[0-9a-f]{3,8}\b/i.test(source);
    });

    expect(
      offenders,
      `Use a design token instead of a raw colour: ${offenders.join(', ')}`,
    ).toEqual([]);
  });
});

/**
 * The last rename touched sixty files, several of which a search for the
 * product name could not even find because the wordmark was split across two
 * JSX nodes. These make the next one a one-file change.
 */
describe('invariant: the brand name has exactly one home', () => {
  // Assembled at runtime so this file does not itself contain the literal,
  // which would make the test fail on itself.
  const NAME = ['Nested', 'Flow'].join(' ');

  it('is written in src/lib/brand.ts and nowhere else in src', async () => {
    const files = await sourceFiles('src/**/*.{ts,tsx}');

    const offenders = files.filter((file) => {
      if (file === 'src/lib/brand.ts') return false;
      // Comments may name the product; they never reach a user, and forcing
      // an interpolation into a sentence of prose helps nobody.
      const source = readFileSync(join(ROOT, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');
      return source.includes(NAME);
    });

    expect(
      offenders,
      `Read the name from \`brand\` in @/lib/brand instead of writing it: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('leaves no trace of the previous name in src', async () => {
    const files = await sourceFiles('src/**/*.{ts,tsx,css}');
    const previous = ['Kyli', 'X'].join('');

    const offenders = files.filter((file) => {
      const source = readFileSync(join(ROOT, file), 'utf8');
      return source.toLowerCase().includes(previous.toLowerCase());
    });

    expect(offenders, `Stale branding in: ${offenders.join(', ')}`).toEqual([]);
  });

  it('builds the wordmark from the same string as the name', async () => {
    const { brand } = await import('../../src/lib/brand');
    expect(brand.wordmark.lead + brand.wordmark.accent).toBe(brand.name.replace(/\s/g, ''));
  });
});
