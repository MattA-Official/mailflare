// Composer smoke test. Runs against `bun run preview` with the local seed (`bun run seed:local`:
// admin@example.test / mailflare-dev). Covers what upstream's compose-insert-link test checked, plus
// autosave, undo send and the /drafts/[messageId] route. Local delivery cannot reach the internet,
// so nothing here waits for a message to be delivered.
import { expect, test, type Page } from './helpers/test'

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:8787'

async function signIn(page: Page) {
  await page.goto(`${BASE}/login`)
  await page.getByLabel(/^email/i).fill('admin@example.test')
  await page.getByLabel(/^password/i).fill('mailflare-dev')
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await page.waitForURL('**/inbox')
}

async function openComposer(page: Page) {
  await page.getByRole('button', { name: /^compose$/i }).first().click()
  const form = page.getByRole('region', { name: /new message|compose/i })
  await expect(form).toBeVisible()
  return form
}

test('autosave creates a draft, Undo returns the message to Drafts and reopens it', async ({ page }) => {
  await signIn(page)
  await openComposer(page)
  const subject = `Undo ${Date.now()}`
  await page.locator('#popup-to').fill('bob@example.org')
  await page.locator('#popup-to').press('Enter')
  await page.locator('#popup-subject').fill(subject)
  await page.locator('#popup-text').click()
  await page.keyboard.type('Hello')
  await expect(page.getByText(/draft saved/i)).toBeVisible({ timeout: 5000 })

  await page.getByRole('button', { name: /^send$/i }).click()
  const toast = page.getByRole('status').filter({ hasText: subject })
  await expect(toast).toContainText(/sending/i)
  await toast.getByRole('button', { name: /undo/i }).click()
  await expect(page.getByRole('status')).toContainText(/cancelled/i)
  await expect(page.locator('#popup-subject')).toHaveValue(subject)
})

test('inserting a link never submits the form', async ({ page }) => {
  await signIn(page)
  await openComposer(page)
  let sent = false
  page.on('request', (request) => { if (request.url().endsWith('/api/send')) sent = true })
  const body = page.locator('#popup-text')
  const linkButton = page.getByRole('button', { name: /insert link/i }).last()

  // Apply inserts the URL at the caret.
  await body.click()
  await linkButton.click()
  await page.getByRole('textbox', { name: /insert link/i }).fill('example.com')
  await page.getByRole('button', { name: /apply/i }).click()
  await expect(body.locator('a[href="https://example.com/"], a[href="https://example.com"]')).toHaveCount(1)

  // Enter links the selection.
  await body.click()
  await page.keyboard.type(' word')
  await page.keyboard.press('Shift+ArrowLeft')
  await page.keyboard.press('Shift+ArrowLeft')
  await page.keyboard.press('Shift+ArrowLeft')
  await page.keyboard.press('Shift+ArrowLeft')
  await page.keyboard.press('ControlOrMeta+k')
  await page.getByRole('textbox', { name: /insert link/i }).fill('https://mailflare.test')
  await page.keyboard.press('Enter')
  await expect(body.locator('a[href^="https://mailflare.test"]')).toHaveText('word')

  // A blank URL and Escape both close the popup without inserting.
  const links = await body.locator('a').count()
  await linkButton.click()
  await page.getByRole('button', { name: /apply/i }).click()
  await expect(page.getByRole('textbox', { name: /insert link/i })).toHaveCount(0)
  await linkButton.click()
  await page.getByRole('textbox', { name: /insert link/i }).fill('ignored.test')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('textbox', { name: /insert link/i })).toHaveCount(0)
  await expect(body.locator('a')).toHaveCount(links)
  expect(sent).toBe(false)
})

test('/drafts/[messageId] opens the draft and closing returns to /drafts', async ({ page }) => {
  await signIn(page)
  await openComposer(page)
  const saved = page.waitForResponse(response => response.url().endsWith('/api/drafts') && response.request().method() === 'POST')
  await page.locator('#popup-subject').fill('Route draft')
  const draft = (await (await saved).json()) as { draft: { id: string } }
  await page.goto(`${BASE}/drafts/${draft.draft.id}`)
  await expect(page.locator('#popup-subject')).toHaveValue('Route draft')
  await page.getByRole('button', { name: /^close composer$/i }).click()
  await page.waitForURL('**/drafts')
})
