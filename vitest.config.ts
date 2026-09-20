import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    exclude: ['tests/e2e/**'],
    setupFiles: ['./tests/setup-env.ts'],
    globalSetup: ['./tests/global-setup.ts'],
    // Integration tests share one database; running files in parallel would
    // have them truncating each other's rows mid-assertion.
    fileParallelism: false,
    testTimeout: 20_000,
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
