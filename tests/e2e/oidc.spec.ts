// Fork-only: Mailflare as an OpenID Connect provider. An admin registers an app, gives themselves a
// role, and an app (played by this test) signs them in with the code flow and PKCE.
import { createHash, createHmac, randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { test, expect, type Page } from './helpers/test'
import { runLocalSql } from './helpers/local-db'

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:8787'
const EMAIL = 'admin@example.test'
const PASSWORD = 'mailflare-dev'
const CALLBACK = 'http://localhost:9917/auth/callback'
// Base32 for the bytes "12345678901234567890", the RFC 6238 test secret.
const TOTP_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

function totp(secret: string, at = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const char of secret) bits += alphabet.indexOf(char).toString(2).padStart(5, '0')
  const key = Buffer.from(bits.match(/.{8}/g)!.map(byte => Number.parseInt(byte, 2)))
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)))
  const mac = createHmac('sha1', key).update(counter).digest()
  const offset = mac[mac.length - 1]! & 0xf
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}

const base64url = (buffer: Buffer) => buffer.toString('base64url')
function decodeJwt(token: string) {
  return JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8'))
}

async function signIn(page: Page, path = '/login') {
  await page.goto(`${BASE}${path}`)
  await page.getByLabel(/^email/i).fill(EMAIL)
  await page.getByLabel(/^password/i).fill(PASSWORD)
  await page.getByRole('button', { name: /^sign in$/i }).click()
}

// The app's callback: a real local server, since the browser follows Mailflare's redirect to it.
let callback: URL | null = null
let server: Server
test.beforeAll(async () => {
  server = createServer((request, response) => {
    callback = new URL(request.url ?? '/', 'http://localhost:9917')
    response.writeHead(200, { 'Content-Type': 'text/html' }).end('<p>Signed in</p>')
  })
  await new Promise<void>(resolve => server.listen(9917, '127.0.0.1', resolve))
})

test.afterAll(() => {
  server?.close()
  runLocalSql(`DELETE FROM oidc_apps WHERE name = 'E2E Admin';
UPDATE users SET totp_secret = NULL, totp_enabled = 0, totp_confirmed_at = NULL, require_second_factor = 0 WHERE id = 'usr_dev';`)
})

test('an app signs a two-step admin in with PKCE and sees their roles', async ({ page, request }) => {
  runLocalSql(`DELETE FROM oidc_apps WHERE name = 'E2E Admin';
UPDATE users SET totp_secret = NULL, totp_enabled = 0, require_second_factor = 0 WHERE id = 'usr_dev';`)

  const discovery = await (await request.get(`${BASE}/.well-known/openid-configuration`)).json()
  expect(discovery.issuer).toBe(BASE)
  expect(discovery.code_challenge_methods_supported).toEqual(['S256'])
  const jwks = await (await request.get(discovery.jwks_uri)).json()
  expect(jwks.keys[0]).toMatchObject({ kty: 'EC', crv: 'P-256', alg: 'ES256' })
  expect(jwks.keys[0].d).toBeUndefined()

  // Register the app in the admin pages.
  await signIn(page)
  await page.waitForURL('**/inbox**')
  await page.goto(`${BASE}/apps`)
  await page.getByRole('button', { name: 'New app' }).click()
  await page.getByLabel('Name', { exact: true }).first().fill('E2E Admin')
  await page.getByLabel('Redirect URLs').fill(CALLBACK)
  await page.getByRole('button', { name: 'Add role' }).click()
  const roleNames = page.getByPlaceholder('Owner', { exact: true })
  await roleNames.nth(1).fill('Privacy')
  await page.getByRole('button', { name: 'Register app' }).click()
  await expect(page.getByText('App registered')).toBeVisible()
  const codes = page.locator('code')
  const clientId = (await codes.nth(0).textContent())!.trim()
  const clientSecret = (await codes.nth(1).textContent())!.trim()
  expect(clientId).toMatch(/^mfc_/)
  expect(clientSecret).toMatch(/^mfcs_/)
  await page.getByRole('button', { name: 'Done' }).click()
  await page.waitForURL('**/apps/app_*')
  await expect(page.getByText('Nobody has a role in this app yet.')).toBeVisible()

  // Give this account the Owner role. It has no second factor yet, so the tab warns.
  await page.goto(`${BASE}/accounts/usr_dev/apps`)
  await expect(page.getByText('This account cannot use apps yet')).toBeVisible()
  await page.getByRole('checkbox', { name: 'Owner' }).check()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Roles saved.')).toBeVisible()

  const verifier = base64url(randomBytes(32))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  const state = base64url(randomBytes(8))
  const nonce = base64url(randomBytes(8))
  const authorize = `${BASE}/oauth/authorize?${new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: CALLBACK, scope: 'openid email profile', state, nonce, code_challenge: challenge, code_challenge_method: 'S256' })}`

  // A password-only session is turned away.
  await page.goto(authorize)
  await page.waitForURL('**/oauth/blocked**')
  await expect(page.getByRole('heading', { name: 'You cannot sign in to E2E Admin yet' })).toBeVisible()
  await expect(page.getByText(/needs a sign-in with two-step verification/)).toBeVisible()

  // With an authenticator set up, signing in again with a code goes straight back to the app.
  runLocalSql(`UPDATE users SET totp_secret = '${TOTP_SECRET}', totp_enabled = 1, totp_confirmed_at = unixepoch(), require_second_factor = 1 WHERE id = 'usr_dev';`)
  await page.getByRole('link', { name: 'Sign in again' }).click()
  await page.waitForURL('**/login?**')
  await page.getByLabel(/^email/i).fill(EMAIL)
  await page.getByLabel(/^password/i).fill(PASSWORD)
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await page.getByLabel(/code/i).first().fill(totp(TOTP_SECRET))
  await page.getByRole('button', { name: /^verify$/i }).click()
  await page.waitForURL('http://localhost:9917/**')
  expect(callback).not.toBeNull()
  const returned = callback as unknown as URL
  expect(returned.searchParams.get('state')).toBe(state)
  expect(returned.searchParams.get('iss')).toBe(BASE)
  const code = returned.searchParams.get('code')!
  expect(code).toBeTruthy()

  const basic = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
  const form = (fields: Record<string, string>) => ({ headers: { 'Authorization': basic, 'Content-Type': 'application/x-www-form-urlencoded' }, data: new URLSearchParams(fields).toString() })

  // A wrong verifier fails and burns nothing it should not; the right one gets tokens.
  const wrong = await request.post(`${BASE}/oauth/token`, form({ grant_type: 'authorization_code', code, redirect_uri: CALLBACK, code_verifier: base64url(randomBytes(32)) }))
  expect(wrong.status()).toBe(400)
  expect((await wrong.json()).error).toBe('invalid_grant')

  // The code was burned by the failed attempt, so start again from the still two-step session.
  await page.goto(authorize)
  await page.waitForURL('http://localhost:9917/**')
  const secondCode = (callback as unknown as URL).searchParams.get('code')!
  const tokens = await request.post(`${BASE}/oauth/token`, form({ grant_type: 'authorization_code', code: secondCode, redirect_uri: CALLBACK, code_verifier: verifier }))
  expect(tokens.status()).toBe(200)
  const set = await tokens.json()
  expect(set.token_type).toBe('Bearer')
  expect(set.expires_in).toBe(900)
  const id = decodeJwt(set.id_token)
  expect(id).toMatchObject({ iss: BASE, sub: 'usr_dev', aud: clientId, nonce, email: EMAIL, name: 'Dev Admin', roles: ['owner'] })
  expect(id.amr).toContain('mfa')

  // The same code cannot be used twice.
  const replay = await request.post(`${BASE}/oauth/token`, form({ grant_type: 'authorization_code', code: secondCode, redirect_uri: CALLBACK, code_verifier: verifier }))
  expect(replay.status()).toBe(400)

  const userinfo = await (await request.get(`${BASE}/oauth/userinfo`, { headers: { Authorization: `Bearer ${set.access_token}` } })).json()
  expect(userinfo).toMatchObject({ sub: 'usr_dev', email: EMAIL, roles: ['owner'] })

  // Refresh rotates; replaying the old refresh token ends the family.
  const refreshed = await request.post(`${BASE}/oauth/token`, form({ grant_type: 'refresh_token', refresh_token: set.refresh_token }))
  expect(refreshed.status()).toBe(200)
  const second = await refreshed.json()
  expect(second.refresh_token).not.toBe(set.refresh_token)
  const reused = await request.post(`${BASE}/oauth/token`, form({ grant_type: 'refresh_token', refresh_token: set.refresh_token }))
  expect(reused.status()).toBe(400)
  const afterReuse = await request.post(`${BASE}/oauth/token`, form({ grant_type: 'refresh_token', refresh_token: second.refresh_token }))
  expect(afterReuse.status()).toBe(400)

  // A fresh sign-in, then taking the role away, stops the next refresh.
  await page.goto(authorize)
  await page.waitForURL('http://localhost:9917/**')
  const thirdCode = (callback as unknown as URL).searchParams.get('code')!
  const third = await (await request.post(`${BASE}/oauth/token`, form({ grant_type: 'authorization_code', code: thirdCode, redirect_uri: CALLBACK, code_verifier: verifier }))).json()
  await page.goto(`${BASE}/accounts/usr_dev/apps`)
  await page.getByRole('checkbox', { name: 'Owner' }).uncheck()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Roles saved.')).toBeVisible()
  const revoked = await request.post(`${BASE}/oauth/token`, form({ grant_type: 'refresh_token', refresh_token: third.refresh_token }))
  expect(revoked.status()).toBe(400)

  // Without a role the sign-in page explains, and prompt=none tells the app directly.
  await page.goto(authorize)
  await page.waitForURL('**/oauth/blocked**')
  await expect(page.getByText(/no role in this app/)).toBeVisible()
  await page.goto(`${authorize}&prompt=none`)
  await page.waitForURL('http://localhost:9917/**')
  expect((callback as unknown as URL).searchParams.get('error')).toBe('access_denied')

  // A wrong client secret is refused.
  const badClient = await request.post(`${BASE}/oauth/token`, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, data: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: 'x', client_id: clientId, client_secret: 'nope' }).toString() })
  expect(badClient.status()).toBe(401)
})
