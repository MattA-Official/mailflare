// Loads SPF/DKIM/DMARC results once per message, with at most four concurrent requests.
// Ported from legacy/src/components/messages/use-message-authentication.ts.
import type { MaybeRefOrGetter } from 'vue'
import type { MessageAuthenticationResponse } from '#lib/email/authentication-types'
import { fetchMessageAuthentication } from '~/utils/messages/message-details-utils'

/** Stored results are immutable, so cache them across the reader. */
const resolved = new Map<string, MessageAuthenticationResponse>()
const pending = new Map<string, Promise<MessageAuthenticationResponse>>()
const queue: Array<() => void> = []
const MAX_CONCURRENT_REQUESTS = 4
let activeRequests = 0

function schedule<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      activeRequests += 1
      task()
        .then(resolve, reject)
        .finally(() => {
          activeRequests -= 1
          queue.shift()?.()
        })
    }
    if (activeRequests < MAX_CONCURRENT_REQUESTS) run()
    else queue.push(run)
  })
}

function loadMessageAuthentication(messageId: string): Promise<MessageAuthenticationResponse> {
  const cached = resolved.get(messageId)
  if (cached) return Promise.resolve(cached)
  const inFlight = pending.get(messageId)
  if (inFlight) return inFlight
  const request = schedule(() => fetchMessageAuthentication(messageId))
    .then((result) => {
      resolved.set(messageId, result)
      return result
    })
    .finally(() => {
      pending.delete(messageId)
    })
  pending.set(messageId, request)
  return request
}

export function useMessageAuthentication(messageId: MaybeRefOrGetter<string | null | undefined>, direction: MaybeRefOrGetter<string | null | undefined>) {
  const state = shallowRef<{ messageId: string, authentication: MessageAuthenticationResponse | null, failed: boolean } | null>(null)
  const inbound = computed(() => !!toValue(messageId) && toValue(direction) === 'inbound')

  watch([() => toValue(messageId), inbound], ([id, isInbound], _previous, onCleanup) => {
    if (!id || !isInbound) return
    let cancelled = false
    onCleanup(() => {
      cancelled = true
    })
    loadMessageAuthentication(id)
      .then((authentication) => {
        if (!cancelled) state.value = { messageId: id, authentication, failed: false }
      })
      .catch(() => {
        if (!cancelled) state.value = { messageId: id, authentication: null, failed: true }
      })
  }, { immediate: true })

  const current = computed(() => (state.value?.messageId === toValue(messageId) ? state.value : null))
  const authentication = computed(() => {
    const id = toValue(messageId)
    return current.value?.authentication ?? (id ? resolved.get(id) ?? null : null)
  })
  const failed = computed(() => current.value?.failed ?? false)
  const loading = computed(() => inbound.value && !authentication.value && !failed.value)
  return { authentication, failed, loading }
}
