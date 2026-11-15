// The message list and counts caches (app/utils/messages/list-cache.ts) must not keep a failed
// response: a 500 used to be cached as an empty folder until the next change event.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { api } from '../../app/utils/auth-client'

let responses: Response[] = []

beforeEach(() => {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value), removeItem: (key: string) => store.delete(key) })
  vi.stubGlobal('window', { location: { assign: vi.fn() }, dispatchEvent: vi.fn() })
  vi.stubGlobal('api', api)
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => responses.shift() ?? Response.json({}))
})

afterEach(() => {
  vi.unstubAllGlobals()
  responses = []
})

describe('message list cache', () => {
  test('a failed list request throws and is fetched again next time', async () => {
    const { clearMessageClientState, fetchMessageList } = await import('../../app/utils/messages/list-cache')
    clearMessageClientState()
    const params = new URLSearchParams({ mailboxId: 'mbx_1' })
    responses = [Response.json({ error: 'Boom' }, { status: 500 }), Response.json({ messages: [{ id: 'msg_1' }], total: 1 })]
    await expect(fetchMessageList(params)).rejects.toThrow('Boom')
    const page = await fetchMessageList(params)
    expect(page.total).toBe(1)
    // The good page is cached: no third request.
    expect(await fetchMessageList(params)).toBe(page)
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(2)
  })

  test('a failed counts request throws and is fetched again next time', async () => {
    const { clearMessageClientState, fetchMessageCounts } = await import('../../app/utils/messages/list-cache')
    clearMessageClientState()
    const counts = { folders: {}, customFolders: {}, mailboxes: [] }
    responses = [Response.json({ error: 'Boom' }, { status: 500 }), Response.json({ counts })]
    await expect(fetchMessageCounts('mbx_1')).rejects.toThrow('Boom')
    expect(await fetchMessageCounts('mbx_1')).toEqual(counts)
    expect(await fetchMessageCounts('mbx_1')).toEqual(counts)
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(2)
  })
})
