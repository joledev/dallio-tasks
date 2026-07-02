import { defineConfig, devices } from '@playwright/test';

// Runs against a real dev server + seeded Postgres. globalSetup resets the DB to a known seed and
// each spec reseeds in beforeAll, so runs are order-independent and repeatable with retries:0.
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    // Dedicated port: another local project already holds :3000, so we pin our own to avoid
    // Next.js silently picking a different port (which would leave baseURL pointing at the wrong app).
    baseURL: 'http://localhost:3100',
    viewport: { width: 1440, height: 900 },
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev --port 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
