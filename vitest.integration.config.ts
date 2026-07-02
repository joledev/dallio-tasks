import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Integration tests only. Requires a running Postgres (see docs/engineering/testing.md).
// Each file self-guards: if the DB is unreachable, its suites skip cleanly (no red).
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    // Serial: these suites share one Postgres and create/tear down rows.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
