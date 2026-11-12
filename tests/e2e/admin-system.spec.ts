// Smoke test for the administration pages (workstream 8). Runs against `bun run preview` with the
// local seed (`bun run seed:local`), signed in as the seeded primary admin.
import { expect, test } from '@playwright/test'

const baseURL = process.env.MAILFLARE_URL ?? 'http://localhost:8787'

test.beforeEach(async ({ page }) => {
  await page.goto(`${baseURL}/login`)
  await page.fill('input[type=email]', 'admin@example.test')
  await page.fill('input[type=password]', 'mailflare-dev')
  await page.keyboard.press('Enter')
  await page.waitForURL(/\/inbox/)
})

const pages: [string, RegExp][] = [
  ['/admin', /Admin settings/],
  ['/accounts', /Accounts/],
  ['/api-keys', /Admin API keys/],
  ['/general', /General/],
  ['/agent', /Agent/],
  ['/ai-usage', /AI usage/],
  ['/activity', /Activity/],
  ['/backups', /Backups/],
  ['/branding', /Branding/],
]

for (const [path, title] of pages) {
  test(`renders ${path}`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${baseURL}${path}`)
    await expect(page.locator('header').first()).toContainText(title)
    expect(errors).toEqual([])
  })
}

test('/audit-logs redirects to /activity', async ({ page }) => {
  await page.goto(`${baseURL}/audit-logs`)
  await expect(page).toHaveURL(/\/activity$/)
})

test('account settings tabs load for the seeded admin', async ({ page }) => {
  for (const tab of ['', '/password', '/permissions', '/mailboxes']) {
    await page.goto(`${baseURL}/accounts/usr_dev${tab}`)
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible()
  }
})
