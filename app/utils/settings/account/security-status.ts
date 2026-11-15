// One shared /api/settings/security snapshot keeps every Security card in step after any change.
// Ported from legacy/src/components/settings/security-status-store.ts, on useAsyncData: the cards
// share one key, so they share one request and one result. An account switch clears it through
// clearNuxtData (plugins/session-reset.client.ts).
import { useEventListener } from '@vueuse/core'
import type { SecurityStatus } from '~/types/settings/account'

const KEY = 'settings-security-status'
// Set for a background read: if it fails, the cards keep what they show instead of blanking. Module
// level because the cards share one handler.
let keepOnFailure = false

/** The shared security snapshot. Call from a component's setup. */
export function useSecurityStatus() {
  const { data, status: fetchStatus, error, refresh } = useAsyncData<SecurityStatus>(KEY, async () => {
    const background = keepOnFailure
    keepOnFailure = false
    try {
      return await api<SecurityStatus>('/api/settings/security')
    } catch (cause) {
      if (background && data.value) return data.value
      throw cause
    }
  })

  // Changes elsewhere (another tab, a dialog) and coming back to the page read it again. These join a
  // read already in flight rather than replacing it.
  const refreshInBackground = () => {
    keepOnFailure = true
    void refresh({ dedupe: 'defer' })
  }
  useEventListener(window, 'mailflare:security-changed', refreshInBackground)
  useEventListener(window, 'focus', refreshInBackground)
  useEventListener(document, 'visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshInBackground()
  })

  return {
    status: readonly(data),
    error: computed(() => Boolean(error.value)),
    loading: computed(() => fetchStatus.value === 'pending'),
    /** Read again after a change, replacing any read in flight, and wait for the result. */
    refresh: () => {
      keepOnFailure = false
      return refresh()
    },
  }
}
