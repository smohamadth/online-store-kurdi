// ---------------------------------------------------------------------------
// Playwright E2E config — the real storefront + admin flows against a live
// API and a seeded database (not the in-memory mocks the unit/integration
// suites use).
//
// How it works:
//   1. globalSetup provisions a fresh, seeded SQLite database (it copies
//      the committed apps/api/.env.ci template when no .env exists).
//   2. `webServer` starts the API (:3001) and the Next.js production app
//      (:3000) and waits for both health checks.
//   3. The specs in `e2e/` run against that real stack in Chromium.
//
// Run from `apps/web`:
//   npx playwright test
//
// CI wires this into .github/workflows/ci.yml (the `e2e` job). Browsers are
// installed there with `npx playwright install --with-deps chromium`.
// ---------------------------------------------------------------------------
import { defineConfig } from '@playwright/test';
import path from 'node:path';

// The API + web launcher scripts live in the repo root `scripts/`; resolve
// them from this config's own directory so they work regardless of CWD.
const scripts = path.resolve(__dirname, '../../scripts');

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  // Browser specs are independent; parallelise across files on CI.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  webServer: [
    {
      command: `bash ${path.join(scripts, 'e2e-api.sh')}`,
      url: 'http://127.0.0.1:3001/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `bash ${path.join(scripts, 'e2e-web.sh')}`,
      url: 'http://127.0.0.1:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
    },
  ],
});
