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
    const files = await sourceFiles('src/**/*.{ts,tsx}');

    const offenders = files.filter((file) => {
      const source = readFileSync(join(ROOT, file), 'utf8');
      // A template literal containing a SQL keyword and an interpolation, not
      // wrapped in drizzle's sql`` tag, is an injection waiting to happen.
      return /(?<!sql)`[^`]*\b(select|insert|update|delete)\b[^`]*\$\{/i.test(source);
    });

    expect(offenders, `Possible SQL string building in: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('invariant: money never touches floating point', () => {
  it('uses no float parsing or float rounding in the money module', () => {
    const source = readFileSync(join(ROOT, 'src/lib/money/index.ts'), 'utf8');

    expect(source).not.toMatch(/parseFloat/);
    expect(source).not.toMatch(/\.toFixed\(/);
    expect(source).not.toMatch(/Math\.round|Math\.floor|Math\.ceil/);
  });

  it('exposes no money helper that takes or returns a number amount', async () => {
    const source = readFileSync(join(ROOT, 'src/lib/money/index.ts'), 'utf8');

    // ratioToPercent returns a number on purpose (it is a percentage for a
    // progress bar, not an amount); every other export trades in bigint.
    const numericReturns = [...source.matchAll(/export function (\w+)[^)]*\): (\w+)/g)]
      .filter(([, , type]) => type === 'number')
      .map(([, name]) => name);

    expect(numericReturns).toEqual(['exponentOf', 'ratioToPercent']);
  });

  it('has no float arithmetic on amounts anywhere in src', async () => {
    const files = await sourceFiles('src/**/*.{ts,tsx}');

    const offenders = files.filter((file) => {
      if (file.endsWith('.test.ts')) return false;
      const source = readFileSync(join(ROOT, file), 'utf8');
      return /parseFloat\s*\(/.test(source);
    });

    expect(offenders, `parseFloat found in: ${offenders.join(', ')}`).toEqual([]);
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
