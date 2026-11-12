// One shared /api/settings/security snapshot keeps every Security card in step after any change.
import { onBeforeUnmount, onMounted, readonly, ref, shallowRef } from 'vue'
// Ported from legacy/src/components/settings/security-status-store.ts.
import { authFetch, AUTH_SESSION_CHANGED_EVENT } from '~/utils/auth-client'
import type { SecurityStatus } from '~/types/settings/account'

const status = shallowRef<SecurityStatus | null>(null)
const error = ref(false)
const loading = ref(false)
let inflight: Promise<void> | null = null
let inflightGeneration = 0
let generation = 0
let subscribers = 0

/**
 * `force` waits for an in-flight read and then starts a fresh one, so a focus refresh that
 * began before a mutation cannot be mistaken for its result.
 */
export async function refreshSecurityStatus(force = false): Promise<void> {
  if (inflight) {
    if (!force) return inflight
    // A pending request from an older account generation is not a reason to wait.
    if (inflightGeneration === generation) await inflight
    else inflight = null
  }
  loading.value = true
  error.value = false
  const requestGeneration = generation
  const request = (async () => {
    try {
      const res = await authFetch('/api/settings/security')
      const data = (await res.json()) as SecurityStatus
      if (!res.ok) throw new Error('security-status')
      // A response for the previous account must never repaint the cards.
      if (requestGeneration === generation) status.value = data
    } catch {
      if (requestGeneration === generation) error.value = true
    } finally {
      if (requestGeneration === generation) loading.value = false
      // Do not let an old request clear a newer one's slot.
      if (inflightGeneration === requestGeneration) {
        inflight = null
        inflightGeneration = 0
      }
    }
  })()
  inflight = request
  inflightGeneration = requestGeneration
  return request
}

function reset() {
  generation++
  status.value = null
  error.value = false
  loading.value = false
  inflight = null
  inflightGeneration = 0
}

function onSessionChanged() {
  reset()
  void refreshSecurityStatus()
}

function onWindowActivity() {
  void refreshSecurityStatus()
}

function listen(on: boolean) {
  const method = on ? 'addEventListener' : 'removeEventListener'
  window[method]('mailflare:security-changed', onWindowActivity)
  window[method](AUTH_SESSION_CHANGED_EVENT, onSessionChanged)
  window[method]('focus', onWindowActivity)
  document[method]('visibilitychange', onWindowActivity)
}

/** The shared security snapshot. Call from a component's setup. */
export function useSecurityStatus() {
  onMounted(() => {
    if (subscribers++ === 0) listen(true)
    if (!status.value && !inflight) void refreshSecurityStatus()
  })
  onBeforeUnmount(() => {
    if (--subscribers === 0) {
      listen(false)
      // The next page must not wait for, or be repainted by, this page's read.
      reset()
    }
  })
  return { status: readonly(status), error: readonly(error), loading: readonly(loading) }
}
