// Per-mailbox folder list cache, ported from legacy/src/lib/folders/client.ts. Shared by the sidebar,
// the message actions and the rules editor so they make one request between them.
const CACHE_TTL_MS = 15_000
const MAX_CACHE_ENTRIES = 32
const MAX_INVALIDATION_RETRIES = 8
const cache = new Map<string, { expiresAt: number, data: FolderListResponse }>()
const requests = new Map<string, Promise<FolderListResponse>>()
let epoch = 0
let sessionEpoch = 0
let listenersInstalled = false

export type FolderListResponse = { folders?: unknown[], error?: string }
export const FOLDERS_CHANGED_EVENT = 'mailflare:folders-changed'

function invalidate(): void {
  ++epoch
  cache.clear()
  requests.clear()
}

function invalidateSession(): void {
  ++sessionEpoch
  invalidate()
}

function installInvalidationListeners(): void {
  if (listenersInstalled || !import.meta.client) return
  listenersInstalled = true
  window.addEventListener(AUTH_SESSION_CHANGED_EVENT, invalidateSession)
  window.addEventListener('mailflare:messages-changed', invalidate)
  window.addEventListener(FOLDERS_CHANGED_EVENT, invalidate)
}

export function invalidateFolderCache(): void {
  invalidate()
}

function invalidated(): never {
  throw new Error('Folder request was invalidated')
}

export async function getMailboxFolders<T extends FolderListResponse = FolderListResponse>(mailboxId: string): Promise<T> {
  installInvalidationListeners()
  const sessionToken = getClientSessionToken()
  const requestSessionEpoch = sessionEpoch
  const key = `${sessionToken ?? ''}\u0000${mailboxId}`
  const sessionChanged = () => sessionEpoch !== requestSessionEpoch || sessionToken !== getClientSessionToken()
  for (let retries = 0; ; retries++) {
    if (sessionChanged()) invalidated()
    const cached = cache.get(key)
    if (cached && cached.expiresAt > Date.now()) {
      cache.delete(key)
      cache.set(key, cached)
      return cached.data as T
    }
    if (cached) cache.delete(key)

    const requestEpoch = epoch
    let request = requests.get(key)
    if (!request) {
      const slot: { request?: Promise<FolderListResponse> } = {}
      slot.request = (async () => {
        const params = new URLSearchParams({ mailboxId })
        const response = await authFetch(`/api/folders?${params.toString()}`, { cache: 'no-store' })
        const data = (await response.json()) as FolderListResponse
        if (!response.ok) throw new Error(data.error ?? 'Unable to load folders')
        if (requestEpoch !== epoch || sessionChanged() || requests.get(key) !== slot.request) invalidated()
        cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS })
        if (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value!)
        return data
      })()
      request = slot.request
      requests.set(key, request)
    }
    try {
      const data = await request
      if (sessionChanged()) invalidated()
      if (requestEpoch !== epoch) {
        if (retries >= MAX_INVALIDATION_RETRIES) invalidated()
        continue
      }
      return data as T
    } catch (error) {
      if (sessionChanged()) invalidated()
      if (requestEpoch === epoch || retries >= MAX_INVALIDATION_RETRIES) throw error
    } finally {
      if (requests.get(key) === request) requests.delete(key)
    }
  }
}
