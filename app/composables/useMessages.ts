// A page of a message folder, kept fresh by the change events. Ported from
// legacy/src/hooks/use-messages.ts; arguments are getters so a list follows route and search changes.
import type { MaybeRefOrGetter } from 'vue'
import { useEventListener } from '@vueuse/core'
import { getMessagesChangedDetail, MESSAGES_CHANGED_EVENT } from '#lib/messages/change-events'
import type { Message, MessageFilterOptions, MessageFolder } from '~/types/messages'
import { clearMessageCountsCache, clearMessageListCache, fetchMessageList, getMessageQueryParams, peekMessageList } from '~/utils/messages/list-cache'

const REFRESH_DEBOUNCE_MS = 150

export function useMessages(
  folder: MaybeRefOrGetter<MessageFolder>,
  mailboxId: MaybeRefOrGetter<string | null | undefined>,
  filters: MaybeRefOrGetter<MessageFilterOptions | undefined> = undefined,
  enabled: MaybeRefOrGetter<boolean> = true,
  folderId: MaybeRefOrGetter<string | null | undefined> = undefined,
) {
  const params = () => getMessageQueryParams(toValue(folder), toValue(mailboxId), toValue(filters), toValue(folderId))
  const initialPage = toValue(enabled) ? peekMessageList(params()) : undefined
  const messages = ref<Message[]>(initialPage?.messages ?? [])
  const isLoading = ref(toValue(enabled) && !initialPage)
  const total = ref(initialPage?.total ?? 0)
  const limit = ref(initialPage?.limit ?? toValue(filters)?.limit ?? 25)
  const offset = ref(initialPage?.offset ?? toValue(filters)?.offset ?? 0)
  const unreadCount = computed(() => messages.value.filter(m => m.direction === 'inbound' && !m.read).length)
  let requestNumber = 0
  let refreshTimer: ReturnType<typeof setTimeout> | null = null

  async function load(force = false, showLoading = false) {
    if (!toValue(enabled)) return
    const current = ++requestNumber
    if (showLoading) isLoading.value = true
    try {
      const data = await fetchMessageList(params(), force)
      if (current !== requestNumber) return
      const currentFilters = toValue(filters)
      messages.value = data.messages ?? []
      total.value = data.total ?? 0
      limit.value = data.limit ?? currentFilters?.limit ?? 25
      offset.value = data.offset ?? currentFilters?.offset ?? 0
    } finally {
      if (current === requestNumber) isLoading.value = false
    }
  }

  watch(
    () => [params().toString(), toValue(enabled)],
    () => {
      // A folder switch paints the cached page immediately, then refreshes.
      const cached = peekMessageList(params())
      if (cached) {
        messages.value = cached.messages ?? []
        total.value = cached.total ?? 0
      }
      void load(false, !cached).catch(() => undefined)
    },
    { immediate: true },
  )

  function patchReadState(event: Event) {
    const detail = getMessagesChangedDetail(event)
    if (detail?.kind !== 'read' || !detail.messageIds?.length) return
    const ids = new Set(detail.messageIds)
    const read = detail.read !== false
    messages.value = messages.value.map((message) => {
      if (message.threadMessageIds) {
        // Only the flipped members change a conversation row's unread count.
        const threadSize = message.threadMessageIds.length
        const flipped = message.threadMessageIds.reduce((count, id) => count + (ids.has(id) ? 1 : 0), 0)
        if (!flipped) return message
        const threadUnread = Math.min(threadSize, Math.max(0, (message.threadUnread ?? 0) + (read ? -flipped : flipped)))
        return { ...message, read: threadUnread === 0, threadUnread }
      }
      return ids.has(message.id) ? { ...message, read } : message
    })
  }

  function onMessagesChanged(event: Event) {
    if (!toValue(enabled)) return
    const readOnly = getMessagesChangedDetail(event)?.kind === 'read'
    // Read flips patch in place; "unread only" still needs a server refetch.
    if (readOnly && toValue(filters)?.read !== 'unread') return
    if (!readOnly) {
      clearMessageListCache()
      clearMessageCountsCache()
    }
    if (document.visibilityState !== 'visible') return
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = setTimeout(() => {
      refreshTimer = null
      void load(true).catch(() => undefined)
    }, REFRESH_DEBOUNCE_MS)
  }

  if (import.meta.client) {
    useEventListener(window, MESSAGES_CHANGED_EVENT, onMessagesChanged)
    useEventListener(window, MESSAGES_CHANGED_EVENT, patchReadState)
  }
  onScopeDispose(() => {
    requestNumber += 1
    if (refreshTimer) clearTimeout(refreshTimer)
  })

  return { messages, unreadCount, isLoading, total, limit, offset, refresh: () => load(true) }
}
