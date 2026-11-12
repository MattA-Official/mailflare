import { defineConfig, devices } from '@playwright/test'

// End-to-end tests run against the built Worker in local workerd (`bun run preview`), seeded with
// `bun run seed:local`. `bun run test:e2e` builds nothing: run `bun run build` first. Set
// E2E_BASE_URL to target an instance that is already running instead of starting one.
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:8787'

export default defineConfig({
  testDir: './tests/e2e',
  // One local database shared by every spec, so tests run one at a time.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'bun run seed:local && bun run preview',
        url: `${baseURL}/login`,
        reuseExistingServer: true,
        timeout: 180_000,
      },
})
