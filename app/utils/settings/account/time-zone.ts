// Ported from legacy/src/components/settings/time-zone-form-utils.ts and legacy/src/lib/time/client.ts.
import { clearUserTimeZoneCache, isValidTimeZone } from '#lib/time/utils'
import { authFetch } from '~/utils/auth-client'

export const USER_TIME_ZONE_CHANGED_EVENT = 'mailflare:user-time-zone-changed'

export function listTimeZones(deviceTimeZone: string): string[] {
  const supported = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
  return [...new Set(['UTC', deviceTimeZone, ...supported])].sort((a, b) => a.localeCompare(b))
}

export function formatCurrentTimeInZone(timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, { timeZone, dateStyle: 'full', timeStyle: 'short' }).format(new Date())
}

export async function updateUserTimeZone(value: string): Promise<string | null> {
  const timeZone = value.trim() || null
  if (timeZone && !isValidTimeZone(timeZone)) throw new Error('Choose a valid timezone, such as Asia/Ho_Chi_Minh')
  const response = await authFetch('/api/settings/time-zone', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timeZone }),
  })
  const data = (await response.json()) as { timeZone?: string | null, error?: string }
  if (!response.ok) throw new Error(data.error || 'Could not save timezone')
  return data.timeZone ?? null
}

/** Remembers the saved zone so dates render in it at once, before /api/auth/me is read again. */
export function saveUserTimeZonePreference(userId: string, timeZone: string | null): void {
  const next = JSON.stringify({ userId, timeZone })
  try {
    if (localStorage.getItem('mailflare-user-time-zone') === next) return
    localStorage.setItem('mailflare-user-time-zone', next)
  } catch { /* Saving on the server remains authoritative. */ }
  clearUserTimeZoneCache()
  window.dispatchEvent(new Event(USER_TIME_ZONE_CHANGED_EVENT))
}
