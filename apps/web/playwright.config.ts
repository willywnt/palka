import { defineConfig, devices } from '@playwright/test';

/**
 * Phase 1 (local) E2E. Drives the real app against a running dev server + the
 * seeded demo org ("Toko Falka Demo" — `pnpm db:seed-demo`). Serial + single
 * worker because the POS flow mutates shared stock. CI wiring is deferred.
 *
 * Prereqs: `pnpm dev` (web on :3000) is up and the demo seed is loaded. Override
 * the login with E2E_EMAIL / E2E_PASSWORD and the target with E2E_BASE_URL.
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // CI also emits an HTML report (uploaded as an artifact on failure); locally the
  // list reporter is enough.
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  // Generous timeouts: against the DEV server, Next compiles each route on first
  // visit (20–40s cold), which a tight per-assertion timeout would mis-flag as a
  // failure. (A production build would remove this; deferred to Phase 2/CI.)
  timeout: 120_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    navigationTimeout: 90_000,
    actionTimeout: 30_000,
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/user.json' },
      dependencies: ['setup'],
    },
  ],
  // CI runs against a production build (`next start`) — instant route serving, no
  // dev cold-compile; locally reuse the dev server the developer already runs.
  webServer: {
    command: process.env.CI ? 'pnpm start:next' : 'pnpm dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
