import next from 'eslint-config-next';
import nextTs from 'eslint-config-next/typescript';

/**
 * Beyond the stock Next.js rules, this config mechanically enforces the two
 * architectural invariants from docs/ARCHITECTURE.md. They are documented as
 * "enforced by lint" there, so they are actual rules rather than a convention
 * that decays the first time someone is in a hurry.
 */
const config = [
  { ignores: ['.next/**', 'node_modules/**', 'coverage/**', 'db/migrations/**'] },

  ...next,
  ...nextTs,

  {
    rules: {
      eqeqeq: ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',

      // Invariant 1: money never touches floating point.
      'no-restricted-globals': [
        'error',
        { name: 'parseFloat', message: 'Money is integer minor units. See src/lib/money.' },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Number',
          property: 'parseFloat',
          message: 'Money is integer minor units. See src/lib/money.',
        },
      ],
    },
  },

  {
    // Invariant 2: SQL lives only in repositories and the db layer.
    // Every other module reaches the database through a repository function,
    // which is the single place user ownership is applied.
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: ['src/**/repository.ts', 'src/lib/db/**', 'src/modules/**/schema.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'drizzle-orm',
              message:
                'Query the database only from a repository.ts, where userId scoping is enforced.',
            },
            {
              name: 'pg',
              message: 'Use the pool exported from src/lib/db.',
            },
          ],
          patterns: [
            {
              group: ['**/lib/db/client', '**/lib/db/client.js'],
              message:
                'Query the database only from a repository.ts, where userId scoping is enforced.',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'tests/**/*.ts'],
    rules: { 'no-restricted-imports': 'off', '@typescript-eslint/no-explicit-any': 'off' },
  },
];

export default config;
