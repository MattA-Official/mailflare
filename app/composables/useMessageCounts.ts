// Folder and mailbox unread counts for the sidebar, the account menu and the app badge. Ported from
// legacy/src/hooks/use-message-counts.ts.
import type { MaybeRefOrGetter } from 'vue'
import { useEventListener } from '@vueuse/core'
import type { MessageCounts, MessageCountsDelta } from '~/types/messages'
import { clearMessageCountsCache, fetchMessageCounts } from '~/utils/messages/list-cache'

const REFRESH_DEBOUNCE_MS = 150

export function emptyMessageCounts(): MessageCounts {
  const zero = () => ({ total: 0, unread: 0 })
  return {
    folders: { inbox: zero(), starred: zero(), snoozed: zero(), sent: zero(), scheduled: zero(), drafts: zero(), archived: zero(), spam: zero(), trash: zero() },
    customFolders: {},
    mailboxes: [],
  }
}

/** `mailboxId` null or undefined counts every accessible mailbox. Disabled, it makes no requests. */
export function useMessageCounts(mailboxId: MaybeRefOrGetter<string | null | undefined>, enabled: MaybeRefOrGetter<boolean> = true) {
  const counts = shallowRef<MessageCounts>(emptyMessageCounts())
  const isLoading = ref(toValue(enabled))
  /** True once a load has succeeded, so callers can tell real zeros from the placeholder. */
  const loaded = ref(false)
  let requestNumber = 0
  let refreshTimer: ReturnType<typeof setTimeout> | null = null

  async function load() {
    if (!toValue(enabled)) {
      isLoading.value = false
      return
    }
    const current = ++requestNumber
    isLoading.value = true
    try {
      const next = await fetchMessageCounts(toValue(mailboxId))
      if (current !== requestNumber) return
      counts.value = next ?? emptyMessageCounts()
      loaded.value = !!next
    } catch {
      // Counts are decoration; a failed request keeps the last ones.
    } finally {
      if (current === requestNumber) isLoading.value = false
    }
  }

  function onMessagesChanged() {
    clearMessageCountsCache()
    if (document.visibilityState !== 'visible') return
    if (refreshTimer) clearTimeout(refreshTimer)
    // The cache was cleared above, so every counter refreshing for the same change shares one request.
    refreshTimer = setTimeout(() => {
      refreshTimer = null
      void load()
    }, REFRESH_DEBOUNCE_MS)
  }

  function onDelta(event: Event) {
    const delta = (event as CustomEvent<MessageCountsDelta>).detail?.inboxUnreadDelta
    if (!delta) return
    const inbox = counts.value.folders.inbox
    counts.value = { ...counts.value, folders: { ...counts.value.folders, inbox: { ...inbox, unread: Math.max(0, inbox.unread + delta) } } }
  }

  watch(() => [toValue(mailboxId), toValue(enabled)], () => void load(), { immediate: true })
  if (import.meta.client) {
    useEventListener(window, 'mailflare:messages-changed', onMessagesChanged)
    useEventListener(window, 'mailflare:message-counts-changed', onMessagesChanged)
    useEventListener(window, 'mailflare:message-counts-delta', onDelta)
  }
  onScopeDispose(() => {
    requestNumber += 1
    if (refreshTimer) clearTimeout(refreshTimer)
  })

  return { counts, isLoading, loaded, refresh: load }
}
