// Ported from legacy/src/components/compose/compose-preferences-utils.ts. The account's composer
// defaults, fetched once per page load and shared by every composer and the settings page.
import type { ComposePreferences } from '#lib/compose/types'
import { authFetch } from '~/utils/auth-client'

let cached: ComposePreferences | null = null
let inflight: Promise<ComposePreferences> | null = null

export function loadComposePreferences(): Promise<ComposePreferences> {
  if (cached) return Promise.resolve(cached)
  inflight ??= authFetch('/api/settings/compose')
    .then(async (response) => {
      if (!response.ok) throw new Error('Failed to load composer settings')
      cached = (await response.json()) as ComposePreferences
      return cached
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

export function getCachedComposePreferences(): ComposePreferences | null {
  return cached
}

export async function updateComposePreferences(next: Partial<ComposePreferences>): Promise<ComposePreferences> {
  const response = await authFetch('/api/settings/compose', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(next),
  })
  const data = (await response.json().catch(() => null)) as (ComposePreferences & { error?: string, code?: string }) | null
  if (!response.ok || !data) throw new Error(data?.code === 'MIGRATION_REQUIRED' ? 'MIGRATION_REQUIRED' : data?.error ?? 'Failed to save composer settings')
  cached = { trackOpensDefault: data.trackOpensDefault, undoSendSeconds: data.undoSendSeconds }
  return cached
}
