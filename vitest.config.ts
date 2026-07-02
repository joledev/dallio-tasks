import { fileURLToPath } from 'node:url';
import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Integration tests hit a real Postgres and are opt-in via `pnpm test:integration`
    // (own config). Excluded here so `pnpm test` stays fast and green with no DB.
    exclude: [...configDefaults.exclude, 'src/**/*.integration.test.ts'],
    coverage: {
      provider: 'v8',
    },
  },
});
