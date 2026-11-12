import { describe, expect, it } from 'vitest'
import { readSetupCookie, withSetupCookieToken } from '#lib/auth/webauthn/grants'

const request = (cookie?: string) => new Request('https://mail.example.test/api/auth/passkey/setup/options', { headers: cookie ? { Cookie: cookie } : {} })

describe('passkey setup cookie fallback', () => {
  it('reads the setup cookie among others', () => {
    expect(readSetupCookie(request('a=1; ep_setup=tok%2Fen; b=2'))).toBe('tok/en')
    expect(readSetupCookie(request('ep_setupx=no'))).toBeNull()
    expect(readSetupCookie(request())).toBeNull()
  })

  it('fills a missing or empty token from the cookie', () => {
    expect(withSetupCookieToken(request('ep_setup=abcdefgh'), {})).toEqual({ token: 'abcdefgh' })
    expect(withSetupCookieToken(request('ep_setup=abcdefgh'), { token: '', name: 'x' })).toEqual({ token: 'abcdefgh', name: 'x' })
  })

  it('keeps a token the client sent and leaves bodies alone without a cookie', () => {
    expect(withSetupCookieToken(request('ep_setup=abcdefgh'), { token: 'fromlink1' })).toEqual({ token: 'fromlink1' })
    expect(withSetupCookieToken(request(), {})).toEqual({})
    expect(withSetupCookieToken(request('ep_setup=abcdefgh'), null)).toBeNull()
  })
})
