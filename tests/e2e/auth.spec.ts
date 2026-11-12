// Sign-in and onboarding smoke test. Runs against `bun run preview` with the local seed
// (`bun run seed:local`: admin@example.test / mailflare-dev, no MFA). The verification workstream
// wires up the Playwright runner; until then run it with `bunx playwright test tests/e2e`.
import { expect, test } from '@playwright/test'

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:8787'
const EMAIL = 'admin@example.test'
const PASSWORD = 'mailflare-dev'

test('a wrong password shows an error, the right one opens the inbox', async ({ page }) => {
  await page.goto(`${BASE}/login`)
  await page.getByLabel(/^email/i).fill(EMAIL)
  await page.getByLabel(/^password/i).fill('not-the-password')
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await expect(page.getByRole('alert')).toBeVisible()

  await page.getByLabel(/^password/i).fill(PASSWORD)
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await page.waitForURL('**/inbox')

  // Signed in: guest pages and finished setup send you back to the inbox, adding an account does not.
  await page.goto(`${BASE}/login`)
  await page.waitForURL('**/inbox')
  await page.goto(`${BASE}/setup`)
  await page.waitForURL('**/inbox')
  await page.goto(`${BASE}/login?add=1`)
  await expect(page.getByRole('heading', { name: /add another/i })).toBeVisible()
})

test('password reset pages', async ({ page }) => {
  await page.goto(`${BASE}/forgot-password`)
  await page.getByLabel(/email/i).fill(EMAIL)
  await page.getByRole('button', { name: /send/i }).click()
  await expect(page.getByText(/on its way/i)).toBeVisible()

  await page.goto(`${BASE}/reset-password`)
  await expect(page.getByRole('link', { name: /request a new/i })).toBeVisible()

  await page.goto(`${BASE}/reset-password?token=not-a-real-token`)
  await page.getByLabel('New password', { exact: true }).fill('new-password-1')
  await page.getByLabel(/confirm new/i).fill('new-password-1')
  await page.getByRole('button', { name: /set new/i }).click()
  await expect(page.getByRole('alert')).toBeVisible()
})

test('an invalid passkey setup link explains itself', async ({ page }) => {
  await page.goto(`${BASE}/setup/passkey?token=not-a-real-token`)
  await expect(page.getByRole('alert')).toBeVisible()
})

test('register and onboarding lead to setup, which a signed-out visitor cannot use once an admin exists', async ({ page }) => {
  await page.goto(`${BASE}/register`)
  await page.waitForURL('**/login')
  await page.goto(`${BASE}/onboarding`)
  await page.waitForURL('**/login')
})
