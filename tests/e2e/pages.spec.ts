// Parity sweep: every signed-in page renders for the seeded primary admin without an uncaught error,
// a failed API call (5xx) or a blocked resource (the CSP). Runs against `bun run preview` with
// `bun run seed:local` (`bun run test:e2e`). Deeper behaviour is covered by the area specs.
import { expect, test } from './helpers/test'

const PAGES = [
  '/inbox', '/starred', '/snoozed', '/sent', '/scheduled', '/drafts', '/archived', '/spam', '/trash',
  '/compose', '/rules', '/import-export',
  '/calendar', '/booking', '/drive', '/agent/calendar-review',
  '/settings', '/settings/account', '/settings/security', '/settings/api-keys', '/settings/app-passwords',
  '/settings/inbox', '/settings/mailboxes', '/settings/rules', '/settings/auto-reply',
  '/settings/import', '/settings/export', '/settings/import-export',
  '/admin', '/mailboxes', '/domains', '/routing', '/webhooks', '/spam-filter',
  '/accounts', '/api-keys', '/general', '/agent', '/ai-usage', '/activity', '/backups', '/branding',
]

test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel(/^email/i).fill('admin@example.test')
  await page.getByLabel(/^password/i).fill('mailflare-dev')
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await page.waitForURL('**/inbox')
})

for (const path of PAGES) {
  test(`renders ${path}`, async ({ page }) => {
    const problems: string[] = []
    page.on('pageerror', error => problems.push(`page error: ${error.message}`))
    page.on('console', (message) => {
      if (message.type() === 'error' && /Content Security Policy|Refused to/i.test(message.text())) problems.push(`console: ${message.text()}`)
    })
    page.on('response', (response) => {
      if (response.status() >= 500) problems.push(`${response.status()} ${response.request().method()} ${new URL(response.url()).pathname}`)
    })
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    // Still signed in and on a page of the app, not bounced to sign-in or an error screen.
    expect(new URL(page.url()).pathname).not.toBe('/login')
    await expect(page.getByText(/^(404|500)$/)).toHaveCount(0)
    expect(problems).toEqual([])
  })
}

test('security headers are sent on pages and API responses', async ({ page, request }) => {
  const response = await page.goto('/inbox')
  for (const res of [response!, await request.get('/api/setup/status')]) {
    const headers = res.headers()
    expect(headers['content-security-policy']).toContain("default-src 'self'")
    expect(headers['content-security-policy']).not.toContain('unsafe-eval')
    expect(headers['x-frame-options']).toBe('SAMEORIGIN')
    expect(headers['cross-origin-opener-policy']).toBe('same-origin')
  }
})
