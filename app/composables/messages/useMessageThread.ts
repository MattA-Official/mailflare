// Every message in the conversation of `messageId`; refetches when mail changes.
// Ported from legacy/src/components/messages/use-message-thread.ts.
import type { MaybeRefOrGetter } from 'vue'
import type { ThreadMessage } from '~/types/messages'
import {
  fetchMessageThread,
  getCachedMessageThread,
  isMessageThreadInvalidated,
  markMessageThreadReadInCaches,
} from '~/utils/messages/thread-cache'

export function useMessageThread(messageId: MaybeRefOrGetter<string>, threadId: MaybeRefOrGetter<string | null | undefined>) {
  const messages = shallowRef<ThreadMessage[]>([])
  const loading = ref(false)

  watch([() => toValue(messageId), () => toValue(threadId)], ([id, thread], _previous, onCleanup) => {
    if (!thread) {
      messages.value = []
      loading.value = false
      return
    }
    let cancelled = false
    let refreshTimer: number | null = null
    async function load() {
      const cached = getCachedMessageThread(id)
      if (cached) {
        if (!cancelled) {
          messages.value = cached
          loading.value = false
        }
        return
      }
      loading.value = true
      try {
        const next = await fetchMessageThread(id)
        if (!cancelled) messages.value = next
      }
      catch (error) {
        // A newer load is queued; keep the conversation on screen.
        if (!cancelled && !isMessageThreadInvalidated(error)) messages.value = []
      }
      finally {
        if (!cancelled) loading.value = false
      }
    }
    void load()
    function onChange(event: Event) {
      const detail = (event as CustomEvent<{ kind?: string, messageIds?: string[], read?: boolean }>).detail
      if (detail?.kind === 'read') {
        if (!detail.messageIds?.length) return
        const ids = new Set(detail.messageIds)
        const read = detail.read !== false
        markMessageThreadReadInCaches(detail.messageIds, read)
        messages.value = messages.value.map(message => (ids.has(message.id) ? { ...message, read } : message))
        return
      }
      if (document.visibilityState !== 'visible') return
      if (refreshTimer) window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null
        void load()
      }, 150)
    }
    window.addEventListener('mailflare:messages-changed', onChange)
    onCleanup(() => {
      cancelled = true
      window.removeEventListener('mailflare:messages-changed', onChange)
      if (refreshTimer) window.clearTimeout(refreshTimer)
    })
  }, { immediate: true })

  return { messages, loading }
}
