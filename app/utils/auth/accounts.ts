// Accounts signed in on this browser, and switching or signing out between them. Ported from
// legacy/src/lib/auth/accounts-client.ts and legacy/src/lib/auth/logout.ts.
import { setAppBadgeCount } from '#lib/push/app-badge'

export type BrowserAccount = {
  userId: string
  email: string
  name: string
  hasAvatar: boolean
  active: boolean
}

export async function fetchBrowserAccounts(): Promise<BrowserAccount[]> {
  try {
    const response = await authFetch('/api/auth/accounts', { redirectOnUnauthorized: false, cache: 'no-store' })
    if (!response.ok) return []
    return ((await response.json()) as { accounts: BrowserAccount[] }).accounts
  } catch {
    return []
  }
}

/** Returns an error message, or null once the switch succeeded. */
export async function switchBrowserAccount(userId: string): Promise<string | null> {
  const response = await authFetch('/api/auth/switch', {
    method: 'POST',
    redirectOnUnauthorized: false,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  })
  const data = (await response.json().catch(() => ({}))) as { token?: string, error?: string }
  if (!response.ok || !data.token) return data.error ?? 'Could not switch account'
  setClientSessionToken(data.token)
  return null
}

/** Signs another account on this browser out. Returns an error message, or null once it is gone. */
export async function signOutBrowserAccount(userId: string): Promise<string | null> {
  const response = await authFetch('/api/auth/accounts', {
    method: 'DELETE',
    redirectOnUnauthorized: false,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  })
  if (response.ok) return null
  return ((await response.json().catch(() => ({}))) as { error?: string }).error ?? 'Could not remove account'
}

/** Returns true when another signed-in account on this browser took over. */
export async function logoutClientSession(): Promise<boolean> {
  let nextToken: string | undefined
  try {
    const response = await authFetch('/api/auth/logout', { method: 'POST', redirectOnUnauthorized: false })
    nextToken = ((await response.json().catch(() => null)) as { token?: string } | null)?.token
  } catch {
    // Local logout must complete even when the server request is unavailable.
  } finally {
    clearClientSessionToken()
    setAppBadgeCount(0)
  }
  if (!nextToken) return false
  setClientSessionToken(nextToken)
  return true
}
