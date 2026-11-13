<script setup lang="ts">
// The parent route of every folder: the full-width list, or the compact list beside the open
// message. Ported from message-split-layout.tsx and MessageDetailNavigationProvider in
// message-detail-navigation.tsx. The list's width is a resizable UDashboardPanel that the
// dashboard group remembers.
import { useMediaQuery } from '@vueuse/core'
import type { MessageNavigationEntry, MessageNavigationResponse } from '#handlers/api/messages/navigation/types'
import { useConversationView } from '~/composables/messages/useConversationView'
import {
  provideMessageDetailNavigation,
  provideMessageListState,
  provideMessageListVisibility,
  useAssistantOpenState,
} from '~/composables/messages/useMessageListContext'
import { useTwoColumnReading } from '~/composables/messages/useTwoColumnReading'
import { takeOpenedUnreadMessage } from '~/utils/messages/detail-navigation-utils'
import type { MessageFolderConfig, SelectedMessage } from '~/utils/messages/types'

const props = defineProps<{ config: MessageFolderConfig }>()
const route = useRoute()
const { t } = useLanguage()
const { query } = useMailSearch()
const { selectedMailbox, isLoading: mailboxesLoading } = useSelectedMailbox()
const [conversationView] = useConversationView()
const [twoColumnReading] = useTwoColumnReading()
const assistantOpen = useAssistantOpenState()
const isDesktop = useMediaQuery('(min-width: 1024px)')

const LIST_VISIBLE_KEY = 'mailflare-message-list-visible'
function readListVisible() {
  if (!import.meta.client) return true
  try {
    return localStorage.getItem(LIST_VISIBLE_KEY) !== 'false'
  }
  catch {
    return true
  }
}
const manualListVisible = ref(readListVisible())

const selectedMessages = ref<SelectedMessage[]>([])
const offset = ref(0)
const unreadOnly = ref(false)
provideMessageListState({ selectedMessages, offset, unreadOnly })

const selectedMessageId = computed(() => {
  const id = route.params.messageId
  return typeof id === 'string' && id ? id : undefined
})
const grouped = computed(() => conversationView.value && props.config.folder !== 'drafts')
const singleColumn = computed(() => !twoColumnReading.value || !isDesktop.value)
const listVisible = computed(() => !singleColumn.value && !assistantOpen.value && manualListVisible.value)
const showBulkBar = computed(() => selectedMessages.value.length > 0 && !singleColumn.value)

// The layout outlives the page that renders the list, so a filter change resets the shared list
// here instead of from whichever page happens to be mounted.
watch(() => [query.value, selectedMailbox.value?.id ?? '', props.config.folder, props.config.folderId ?? '', grouped.value, unreadOnly.value].join('\u0000'), () => {
  offset.value = 0
  selectedMessages.value = []
})
watch(() => `${props.config.folder}\u0000${props.config.folderId ?? ''}`, () => {
  unreadOnly.value = false
})

provideMessageListVisibility(computed(() => ({
  visible: listVisible.value,
  toggle: () => {
    manualListVisible.value = !manualListVisible.value
    try {
      localStorage.setItem(LIST_VISIBLE_KEY, String(manualListVisible.value))
    }
    catch { /* Storage is optional. */ }
  },
  singleColumn: singleColumn.value,
  backHref: props.config.hrefPrefix,
  backLabel: props.config.titleKey ? t(props.config.titleKey) : props.config.title,
})))

// Newer/older navigation: a window of ids around the open message, re-anchored when it leaves the window.
const navigationKey = computed(() => `${props.config.folder}:${props.config.folderId ?? ''}:${selectedMailbox.value?.id ?? 'all'}:${grouped.value}`)
const snapshot = shallowRef<{ key: string, entries: MessageNavigationEntry[], hasNewer?: boolean, hasOlder?: boolean }>({ key: '', entries: [] })
const openedUnread = shallowRef<{ key: string, ids: Set<string> }>({ key: '', ids: new Set() })

function recordUnread(messageId: string) {
  const current = openedUnread.value
  const ids = new Set(current.key === navigationKey.value ? current.ids : [])
  if (ids.has(messageId) && current.key === navigationKey.value) return
  ids.add(messageId)
  openedUnread.value = { key: navigationKey.value, ids }
}

const dropped = shallowRef<{ key: string, ids: Set<string> }>({ key: '', ids: new Set() })
function dropEntry(messageId: string) {
  const current = dropped.value
  const ids = new Set(current.key === navigationKey.value ? current.ids : [])
  ids.add(messageId)
  dropped.value = { key: navigationKey.value, ids }
}

onMounted(() => {
  const messageId = takeOpenedUnreadMessage()
  if (messageId) recordUnread(messageId)
})

const requestAnchor = computed(() => {
  const current = snapshot.value
  const id = selectedMessageId.value
  if (!id) return undefined
  const currentIndex = current.key === navigationKey.value ? current.entries.findIndex(entry => entry.id === id) : -1
  const beyondWindow = current.key !== navigationKey.value
    || (current.entries.length > 0 && currentIndex === -1)
    || (currentIndex === 0 && current.hasNewer === true)
    || (currentIndex === current.entries.length - 1 && current.hasOlder === true)
  return beyondWindow ? id : undefined
})

watch(() => [requestAnchor.value, mailboxesLoading.value, navigationKey.value] as const, ([anchor, loading, key], _previous, onCleanup) => {
  if (loading || !anchor) return
  let cancelled = false
  onCleanup(() => {
    cancelled = true
  })
  const params = new URLSearchParams({ folder: props.config.folder })
  if (props.config.folderId) params.set('folderId', props.config.folderId)
  const mailboxId = selectedMailbox.value?.id
  if (mailboxId) params.set('mailboxId', mailboxId)
  if (grouped.value) params.set('group', 'thread')
  params.set('around', anchor)
  void authFetch(`/api/messages/navigation?${params.toString()}`)
    .then((response) => {
      if (!response.ok) throw new Error('Unable to load message navigation')
      return response.json() as Promise<MessageNavigationResponse>
    })
    .then((response) => {
      if (!cancelled) snapshot.value = { key, entries: response.messages, hasNewer: response.hasNewer, hasOlder: response.hasOlder }
    })
    .catch(() => {
      if (!cancelled) snapshot.value = { key, entries: [] }
    })
}, { immediate: true })

provideMessageDetailNavigation({
  entries: computed(() => {
    const current = snapshot.value
    if (current.key !== navigationKey.value) return []
    const unreadIds = openedUnread.value.key === navigationKey.value ? openedUnread.value.ids : null
    const droppedIds = dropped.value.key === navigationKey.value ? dropped.value.ids : null
    return current.entries
      .filter(entry => !droppedIds?.has(entry.id))
      .map(entry => ({ ...entry, unread: entry.unread || !!unreadIds?.has(entry.id) }))
  }),
  hrefPrefix: computed(() => props.config.hrefPrefix),
  recordUnread,
  dropEntry,
  showBulkBar,
  bulkFolder: computed(() => (props.config.folderId ? undefined : props.config.folder)),
})
</script>

<template>
  <template v-if="selectedMessageId">
    <MessagesFolderPage v-if="listVisible" :config="config" compact :selected-message-id="selectedMessageId" />
    <NuxtPage />
  </template>
  <NuxtPage v-else />
</template>
