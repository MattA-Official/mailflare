// The app's API client (app/utils/auth-client.ts): api() over the shared $fetch instance, and
// apiErrorMessage() for the errors api(), useApi and useAsyncData return.
import { afterEach, describe, expect, test, vi } from 'vitest'
import { ApiError, api, apiErrorMessage } from '../../app/utils/auth-client'

type Call = { url: string, method: string, headers: Headers, body: unknown }

function mockFetch(respond: (call: Call) => Response) {
  const calls: Call[] = []
  const store = new Map<string, string>([['mailflare-session-token', 'tok_123']])
  vi.stubGlobal('localStorage', { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value), removeItem: (key: string) => store.delete(key) })
  vi.stubGlobal('window', { location: { assign: vi.fn() }, dispatchEvent: vi.fn() })
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init = {}) => {
    const call = { url: String(input), method: init.method ?? 'GET', headers: new Headers(init.headers), body: init.body }
    calls.push(call)
    return respond(call)
  })
  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('api()', () => {
  test('sends the session and time zone headers and JSON bodies', async () => {
    const calls = mockFetch(() => Response.json({ ok: true }))
    const data = await api<{ ok: boolean }>('/api/things', { method: 'POST', body: { name: 'a' } })
    expect(data).toEqual({ ok: true })
    expect(calls[0]!.headers.get('authorization')).toBe('Bearer tok_123')
    expect(calls[0]!.headers.get('x-time-zone')).toBeTruthy()
    expect(calls[0]!.headers.get('content-type')).toBe('application/json')
    expect(calls[0]!.body).toBe('{"name":"a"}')
  })

  test('passes FormData through unchanged', async () => {
    const calls = mockFetch(() => Response.json({}))
    const form = new FormData()
    form.set('file', 'x')
    await api('/api/upload', { method: 'POST', body: form })
    expect(calls[0]!.body).toBe(form)
  })

  test('reads an empty response as null', async () => {
    mockFetch(() => new Response(null, { status: 204 }))
    expect(await api('/api/things/1', { method: 'DELETE' })).toBeNull()
  })

  test('throws ApiError with the server message, status and body, and does not retry', async () => {
    const calls = mockFetch(() => Response.json({ error: 'Name taken', code: 'TAKEN' }, { status: 409 }))
    const error = await api('/api/things').catch(cause => cause)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.message).toBe('Name taken')
    expect(error.status).toBe(409)
    expect(error.data).toEqual({ error: 'Name taken', code: 'TAKEN' })
    expect(calls).toHaveLength(1)
  })

  test('falls back to the status when the server sent no message', async () => {
    mockFetch(() => new Response('oops', { status: 500 }))
    const error = await api('/api/things').catch(cause => cause)
    expect(error.message).toBe('Request failed (500)')
  })

  test('a 401 signs out and goes to /login unless asked not to', async () => {
    mockFetch(() => Response.json({ error: 'Unauthorized' }, { status: 401 }))
    await api('/api/things').catch(() => undefined)
    expect(window.location.assign).toHaveBeenCalledWith('/login')
    expect(localStorage.getItem('mailflare-session-token')).toBeNull()

    mockFetch(() => Response.json({ error: 'Unauthorized' }, { status: 401 }))
    await api('/api/things', { redirectOnUnauthorized: false }).catch(() => undefined)
    expect(window.location.assign).not.toHaveBeenCalled()
  })
})

describe('apiErrorMessage()', () => {
  test('uses the server message from ApiError or a fetch error body', () => {
    expect(apiErrorMessage(new ApiError('Nope', 400, { error: 'Nope' }), 'fallback')).toBe('Nope')
    expect(apiErrorMessage({ data: { error: 'Gone' } }, 'fallback')).toBe('Gone')
  })

  test('falls back otherwise', () => {
    expect(apiErrorMessage(new TypeError('Failed to fetch'), 'fallback')).toBe('fallback')
    expect(apiErrorMessage(null, 'fallback')).toBe('fallback')
  })
})
