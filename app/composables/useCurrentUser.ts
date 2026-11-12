// Shared /api/auth/me state for the route guard, sidebars and account menus.
// Ported from legacy/src/hooks/use-current-user.ts.
export interface CurrentUser {
  id: string
  email: string
  name: string
  timeZone?: string | null
  resetEmail?: string | null
  forwardingEmail?: string | null
  canForwardEmail?: boolean
  role: 'admin' | 'user'
  isPrimaryAdmin: boolean
  canManageMailboxes: boolean
  canManageDomains: boolean
  canManageUsers: boolean
  calendarEnabled: boolean
  driveEnabled: boolean
  keyboardShortcutsEnabled?: boolean
  spamProtectionEnabled?: boolean
  showFullRecipientAddresses?: boolean
  hasAvatar: boolean
  mfaEnabled?: boolean
}

export interface SessionInfo {
  status: number
  hasMailboxes?: boolean
  isSetup?: boolean
  managesDns?: boolean
  user?: CurrentUser | null
}

const MAX_AGE_MS = 5 * 60 * 1000
let cached: { info: SessionInfo, at: number } | null = null
let inflight: Promise<SessionInfo | null> | null = null
let generation = 0
const currentUser = ref<CurrentUser | null>(null)

export function clearCurrentUserCache() {
  generation += 1
  cached = null
  inflight = null
  currentUser.value = null
}

if (import.meta.client) window.addEventListener(AUTH_SESSION_CHANGED_EVENT, clearCurrentUserCache)

async function requestSessionInfo(): Promise<SessionInfo> {
  const cookieResponse = await fetch('/api/auth/me', { cache: 'no-store', signal: AbortSignal.timeout(5000) })
  const response = cookieResponse.status !== 401
    ? cookieResponse
    : await authFetch('/api/auth/me', { redirectOnUnauthorized: false, signal: AbortSignal.timeout(5000) })
  if (!response.ok) return { status: response.status }
  return { status: response.status, ...(await response.json() as Omit<SessionInfo, 'status'>) }
}

/** The cached answer if it is still fresh, without a request. */
export function peekSessionInfo(): SessionInfo | null {
  return cached && Date.now() - cached.at < MAX_AGE_MS ? cached.info : null
}

/** `fresh` bypasses the cache. Network failures resolve to null and are never cached. */
export function fetchSessionInfo({ fresh = false } = {}): Promise<SessionInfo | null> {
  const hit = fresh ? null : peekSessionInfo()
  if (hit) return Promise.resolve(hit)
  if (!inflight) {
    const startedAt = generation
    const request = requestSessionInfo()
      .then((info) => {
        if (startedAt !== generation) return null
        cached = info.status === 200 ? { info, at: Date.now() } : null
        currentUser.value = info.user ?? null
        return info
      })
      .catch(() => null)
      .finally(() => {
        if (inflight === request) inflight = null
      })
    inflight = request
  }
  return inflight
}

/** The signed-in user, or null while unknown or signed out. */
export function useCurrentUser() {
  if (import.meta.client && !currentUser.value) void fetchSessionInfo()
  return readonly(currentUser)
}
