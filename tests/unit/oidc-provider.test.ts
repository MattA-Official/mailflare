// Fork-only: the pure parts of the OIDC provider (server/lib/oidc). The full flow is exercised
// against `bun run preview` (see docs/oidc.md).
import { describe, expect, it } from 'vitest'
import { base64UrlDecode, base64UrlEncode, pkceChallenge, signJwt, timingSafeEqual, verifyJwt } from '../../server/lib/oidc/jwt'
import { appInputSchema, effectiveRoles, isAllowedRedirectUri, newClientSecret, verifyClientSecret } from '../../server/lib/oidc/apps'
import { isTwoFactorAmr } from '../../server/lib/auth/session'
import { safeLoginNext } from '../../app/utils/auth/next'

async function keyPair() {
  return await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair
}

describe('jwt', () => {
  it('signs and verifies an ES256 token', async () => {
    const pair = await keyPair()
    const token = await signJwt({ sub: 'u1', roles: ['owner'] }, { kid: 'k1', privateKey: pair.privateKey }, 'at+jwt')
    const verified = await verifyJwt(token, async kid => kid === 'k1' ? pair.publicKey : null)
    expect(verified?.header).toEqual({ alg: 'ES256', kid: 'k1', typ: 'at+jwt' })
    expect(verified?.payload).toEqual({ sub: 'u1', roles: ['owner'] })
  })

  it('rejects a tampered payload, an unknown key and another algorithm', async () => {
    const pair = await keyPair()
    const token = await signJwt({ sub: 'u1' }, { kid: 'k1', privateKey: pair.privateKey })
    const [header, , signature] = token.split('.')
    const forged = `${header}.${base64UrlEncode(JSON.stringify({ sub: 'admin' }))}.${signature}`
    expect(await verifyJwt(forged, async () => pair.publicKey)).toBeNull()
    expect(await verifyJwt(token, async () => null)).toBeNull()
    const none = `${base64UrlEncode(JSON.stringify({ alg: 'none', kid: 'k1' }))}.${base64UrlEncode('{}')}.`
    expect(await verifyJwt(none, async () => pair.publicKey)).toBeNull()
    expect(await verifyJwt('not.a.jwt', async () => pair.publicKey)).toBeNull()
  })

  it('round-trips base64url', () => {
    const bytes = new Uint8Array([0, 251, 255, 62, 63])
    expect([...base64UrlDecode(base64UrlEncode(bytes))]).toEqual([...bytes])
  })

  it('computes the RFC 7636 appendix B challenge', async () => {
    expect(await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })

  it('compares secrets', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true)
    expect(timingSafeEqual('abc', 'abd')).toBe(false)
    expect(timingSafeEqual('abc', 'abcd')).toBe(false)
  })
})

describe('apps', () => {
  it('allows https redirect URIs and http only for localhost', () => {
    expect(isAllowedRedirectUri('https://admin.example.com/auth/callback')).toBe(true)
    expect(isAllowedRedirectUri('http://localhost:3000/callback')).toBe(true)
    expect(isAllowedRedirectUri('http://127.0.0.1:3000/callback')).toBe(true)
    expect(isAllowedRedirectUri('http://admin.example.com/callback')).toBe(false)
    expect(isAllowedRedirectUri('https://admin.example.com/callback#x')).toBe(false)
    expect(isAllowedRedirectUri('https://user:pass@admin.example.com/')).toBe(false)
    expect(isAllowedRedirectUri('javascript:alert(1)')).toBe(false)
    expect(isAllowedRedirectUri('/relative')).toBe(false)
  })

  it('validates app input', () => {
    const base = { name: 'Admin', redirectUris: ['https://a.example/cb'], roles: [{ key: 'owner', label: 'Owner' }] }
    expect(appInputSchema.safeParse(base).success).toBe(true)
    expect(appInputSchema.safeParse({ ...base, roles: [] }).success).toBe(false)
    expect(appInputSchema.safeParse({ ...base, roles: [{ key: 'Owner!', label: 'Owner' }] }).success).toBe(false)
    expect(appInputSchema.safeParse({ ...base, roles: [{ key: 'a', label: 'A' }, { key: 'a', label: 'B' }] }).success).toBe(false)
    expect(appInputSchema.safeParse({ ...base, redirectUris: ['http://evil.example/cb'] }).success).toBe(false)
  })

  it('keeps only roles the app still offers, in the app order', () => {
    const app = { roles: JSON.stringify([{ key: 'owner', label: 'Owner' }, { key: 'privacy', label: 'Privacy' }]) }
    expect(effectiveRoles(app, ['privacy', 'removed', 'owner'])).toEqual(['owner', 'privacy'])
    expect(effectiveRoles(app, [])).toEqual([])
    expect(effectiveRoles({ roles: 'not json' }, ['owner'])).toEqual([])
  })

  it('checks client secrets, and public clients need none', async () => {
    const { secret, hash, prefix } = await newClientSecret()
    expect(secret.startsWith(prefix)).toBe(true)
    expect(await verifyClientSecret({ clientSecretHash: hash }, secret)).toBe(true)
    expect(await verifyClientSecret({ clientSecretHash: hash }, `${secret}x`)).toBe(false)
    expect(await verifyClientSecret({ clientSecretHash: hash }, null)).toBe(false)
    expect(await verifyClientSecret({ clientSecretHash: null }, null)).toBe(true)
  })
})

describe('sessions', () => {
  it('counts passkeys and password plus a second factor as two-factor', () => {
    expect(isTwoFactorAmr(JSON.stringify(['hwk', 'user']))).toBe(true)
    expect(isTwoFactorAmr(JSON.stringify(['pwd', 'otp', 'mfa']))).toBe(true)
    expect(isTwoFactorAmr(JSON.stringify(['pwd']))).toBe(false)
    expect(isTwoFactorAmr(null)).toBe(false)
    expect(isTwoFactorAmr('garbage')).toBe(false)
  })
})

describe('login next', () => {
  it('accepts only the authorization endpoint', () => {
    expect(safeLoginNext('/oauth/authorize?client_id=x')).toBe('/oauth/authorize?client_id=x')
    expect(safeLoginNext('//evil.example/oauth/authorize?')).toBeNull()
    expect(safeLoginNext('https://evil.example/oauth/authorize?')).toBeNull()
    expect(safeLoginNext('/inbox')).toBeNull()
    expect(safeLoginNext(['/oauth/authorize?'])).toBeNull()
  })
})
