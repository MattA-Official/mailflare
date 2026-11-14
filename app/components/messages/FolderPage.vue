<script setup lang="ts">
// A folder's message list: selection, bulk actions, pagination, the unread filter and emptying
// Trash or Spam. Ported from message-folder-page.tsx. In the split view it is the compact list
// beside the reader; otherwise it fills the page.
import { alertDialog, confirmDestructive } from '~/utils/confirm-dialog'
import { useMediaQuery } from '@vueuse/core'
import type { BulkMessageAction } from '#handlers/api/messages/bulk/types'
import {
  getEmptyFolderConfirmText,
  getEmptyFolderLabel,
  getPermanentDeleteConfirmText,
  getPermanentDeleteFolderLabel,
  PartialDeleteError,
  supportsPermanentDelete,
} from '#lib/messages/permanent-delete-utils'
import { useConversationView } from '~/composables/messages/useConversationView'
import { useMessageListState } from '~/composables/messages/useMessageListContext'
import {
  emptyMessageFolder,
  formatEmailPageTitle,
  getMailboxAddress,
  getPageRange,
  getUnreadFlipCount,
  runBulkMessageAction,
} from '~/utils/messages/list-utils'
import { dispatchMessageCountsDelta } from '~/utils/messages/row-actions-utils'
import type { Message } from '~/types/messages'
import type { MessageFolderConfig, RowMessageAction, SelectedMessage } from '~/utils/messages/types'

const pageSize = 25

const props = withDefaults(defineProps<{
  config: MessageFolderConfig
  compact?: boolean
  selectedMessageId?: string
}>(), { compact: false, selectedMessageId: undefined })

const { t } = useLanguage()
const title = computed(() => (props.config.titleKey ? t(props.config.titleKey) : props.config.title))
const { selectedMailbox, isLoading: mailboxesLoading } = useSelectedMailbox()
const { query } = useMailSearch()
const isMobile = useMediaQuery('(max-width: 767px)')
const listState = useMessageListState()
const usesSharedListState = listState !== null
const offset = listState?.offset ?? ref(0)
const selectedMessages = listState?.selectedMessages ?? ref<SelectedMessage[]>([])
const unreadOnly = listState?.unreadOnly ?? ref(false)
const pendingBulkAction = ref(false)
const emptyingFolder = ref(false)
const actionError = ref<string | null>(null)
const openingMessageId = ref<string | null>(null)
let openingTimer: number | null = null
const [conversationView] = useConversationView()
const visibleOpeningMessageId = computed(() => (openingMessageId.value === props.selectedMessageId ? null : openingMessageId.value))

function markMessageOpening(messageId: string) {
  openingMessageId.value = messageId
  if (openingTimer) window.clearTimeout(openingTimer)
  openingTimer = window.setTimeout(() => {
    openingMessageId.value = null
  }, 3000)
}

const grouped = computed(() => conversationView.value && props.config.folder !== 'drafts')
const { messages, isLoading, total, limit } = useMessages(
  () => props.config.folder,
  () => selectedMailbox.value?.id,
  () => ({
    query: query.value,
    limit: pageSize,
    offset: offset.value,
    read: unreadOnly.value ? 'unread' : 'all',
    group: grouped.value ? 'thread' : undefined,
  }),
  () => !mailboxesLoading.value,
  () => props.config.folderId,
)
const { counts } = useMessageCounts(() => selectedMailbox.value?.id, () => !mailboxesLoading.value)
const hasActiveFilters = computed(() => !!query.value.trim())
const folderCount = computed(() => (props.config.folderId
  ? counts.value.customFolders[props.config.folderId]
  : counts.value.folders[props.config.folder]))
const titleTotal = computed(() => folderCount.value?.total ?? total.value)
const titleUnread = computed(() => folderCount.value?.unread ?? 0)
const mailboxAddress = computed(() => getMailboxAddress(selectedMailbox.value))
const currentAccountName = computed(() => selectedMailbox.value?.displayName ?? selectedMailbox.value?.localPart)
const pageRange = computed(() => getPageRange(offset.value, messages.value.length, total.value))
const selectedIds = computed(() => selectedMessages.value.map(message => message.id))
const hasUnreadSelection = computed(() => selectedMessages.value.some(message => !message.read))
const allVisibleSelected = computed(() => messages.value.length > 0 && messages.value.every(message => selectedIds.value.includes(message.id)))
const compactRows = computed(() => props.compact || isMobile.value)

// In conversation view a row stands for every message of its thread in this folder, so actions and
// drags carry all of them.
function rowMessageIds(message: Pick<Message, 'id' | 'threadMessageIds'>) {
  return message.threadMessageIds ?? [message.id]
}
function expandSelectedIds(ids: string[]) {
  return ids.flatMap(id => rowMessageIds(messages.value.find(message => message.id === id) ?? { id }))
}

// A split-layout list keeps this state in MessagesSplitLayout, which resets it when the list view
// changes. Standalone lists (drafts) own it here.
if (!usesSharedListState) {
  watch(() => [query.value, selectedMailbox.value?.id, props.config.folder, props.config.folderId, unreadOnly.value, grouped.value], () => {
    offset.value = 0
    selectedMessages.value = []
  })
}

watch(offset, () => {
  selectedMessages.value = []
})

if (!props.compact) {
  useHead({
    title: () => (mailboxesLoading.value
      ? title.value
      : formatEmailPageTitle({
          location: title.value,
          inbox: props.config.folder === 'inbox' && !props.config.folderId,
          total: titleTotal.value,
          unread: titleUnread.value,
          emailAddress: mailboxAddress.value,
        })),
  })
}

watch([messages, isLoading], () => {
  if (isLoading.value) return
  const remaining = selectedMessages.value.filter(item => messages.value.some(message => message.id === item.id))
  if (remaining.length !== selectedMessages.value.length) selectedMessages.value = remaining
})

watch([isLoading, offset, () => messages.value.length, total, limit], () => {
  if (isLoading.value || offset.value === 0 || messages.value.length > 0) return
  offset.value = total.value > 0 ? Math.floor((total.value - 1) / limit.value) * limit.value : 0
})

function isSelectionRead(message: Message) {
  return message.read && !(message.threadUnread ?? 0)
}

function updateSelectedMessage(messageId: string, selected: boolean) {
  const message = messages.value.find(item => item.id === messageId)
  if (!message) return
  const current = selectedMessages.value
  if (!selected) {
    selectedMessages.value = current.filter(item => item.id !== messageId)
    return
  }
  if (current.some(item => item.id === messageId)) return
  selectedMessages.value = [...current, { id: message.id, read: isSelectionRead(message) }]
}

function toggleAllVisible(selected: boolean) {
  const visibleIds = new Set(messages.value.map(message => message.id))
  if (!selected) {
    selectedMessages.value = selectedMessages.value.filter(message => !visibleIds.has(message.id))
    return
  }
  const next = new Map(selectedMessages.value.map(message => [message.id, message]))
  for (const message of messages.value) next.set(message.id, { id: message.id, read: isSelectionRead(message) })
  selectedMessages.value = Array.from(next.values())
}

const permanentDeleteFolder = computed(() => (!props.config.folderId && supportsPermanentDelete(props.config.folder) ? props.config.folder : null))
const emptyFolderLabel = computed(() => (permanentDeleteFolder.value ? getEmptyFolderLabel(permanentDeleteFolder.value, t) : ''))

async function emptyFolder() {
  const folder = permanentDeleteFolder.value
  const mailboxId = selectedMailbox.value?.id
  if (!folder || !mailboxId) return
  if (!(await confirmDestructive(getEmptyFolderConfirmText(folder, titleTotal.value, t)))) return
  emptyingFolder.value = true
  try {
    await emptyMessageFolder(mailboxId, folder)
    offset.value = 0
  }
  catch (error) {
    console.error(error)
    void alertDialog(t('list.emptyFailed', { folder: getPermanentDeleteFolderLabel(folder, t) }))
  }
  finally {
    emptyingFolder.value = false
  }
}

let actionErrorTimer: ReturnType<typeof setTimeout> | null = null
watch(actionError, (value) => {
  if (actionErrorTimer) clearTimeout(actionErrorTimer)
  if (!value) return
  actionErrorTimer = setTimeout(() => {
    actionError.value = null
  }, 6000)
})
onBeforeUnmount(() => {
  if (actionErrorTimer) clearTimeout(actionErrorTimer)
  if (openingTimer) window.clearTimeout(openingTimer)
})

function errorMessage(error: unknown) {
  return error instanceof PartialDeleteError ? t('actions.error.deleteSkipped') : t('actions.error.update')
}

async function runSelectedActionReportingErrors(action: BulkMessageAction, folderId?: string) {
  actionError.value = null
  try {
    await runSelectedAction(action, folderId)
  }
  catch (error) {
    actionError.value = errorMessage(error)
  }
}

async function runSelectedAction(action: BulkMessageAction, folderId?: string) {
  const ids = selectedIds.value
  if (ids.length === 0) return
  if (action === 'delete' && !(await confirmDestructive(getPermanentDeleteConfirmText(expandSelectedIds(ids).length, t)))) return

  pendingBulkAction.value = true
  const previousMessages = messages.value
  const readValue = action === 'read' ? true : action === 'unread' ? false : null
  const inboxUnreadDelta = readValue === null || props.config.folder !== 'inbox' || props.config.folderId
    ? 0
    : messages.value
        .filter(message => ids.includes(message.id))
        .reduce((sum, message) => sum + getUnreadFlipCount(message, readValue), 0) * (readValue ? -1 : 1)
  if (readValue !== null) {
    messages.value = messages.value.map(message => (ids.includes(message.id)
      ? { ...message, read: readValue, ...(message.threadMessageIds ? { threadUnread: readValue ? 0 : message.threadMessageIds.length } : {}) }
      : message))
    selectedMessages.value = selectedMessages.value.map(message => ({ ...message, read: readValue }))
    if (inboxUnreadDelta) dispatchMessageCountsDelta({ inboxUnreadDelta })
  }
  try {
    await runBulkMessageAction(expandSelectedIds(ids), action, true, folderId)
    selectedMessages.value = []
  }
  catch (error) {
    if (readValue !== null) {
      messages.value = previousMessages
      if (inboxUnreadDelta) dispatchMessageCountsDelta({ inboxUnreadDelta: -inboxUnreadDelta })
    }
    throw error
  }
  finally {
    pendingBulkAction.value = false
  }
}

async function onRowAction(messageId: string, action: RowMessageAction) {
  actionError.value = null
  try {
    return await runBulkMessageAction(expandSelectedIds([messageId]), action, action !== 'read' && action !== 'unread')
  }
  catch (error) {
    actionError.value = errorMessage(error)
    throw error
  }
}

function dragIdsFor(messageId: string) {
  return expandSelectedIds(selectedIds.value.includes(messageId) ? selectedIds.value : [messageId])
}
</script>

<template>
  <UDashboardPanel
    :id="compact ? 'message-list' : `folder-${config.folderId ?? config.folder}`"
    :resizable="compact"
    :default-size="compact ? 24 : undefined"
    :min-size="compact ? 16 : undefined"
    :max-size="compact ? 60 : undefined"
    :ui="{ body: 'p-0 sm:p-0 gap-0 overscroll-contain', root: compact ? 'max-lg:hidden' : undefined }"
  >
    <template #header>
      <AppNavbar v-if="!compact" :title="title" search />
      <!-- The search box keeps a desktop minimum width that does not fit the narrow list beside the reader. -->
      <AppNavbar v-else banner>
        <div class="flex min-w-0 flex-1 [&_.lg\:min-w-96]:min-w-0">
          <AppHeaderSearch />
        </div>
      </AppNavbar>
      <div class="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-default" :class="compact ? 'px-4' : 'px-4.5 md:px-6'">
        <h2 v-if="selectedMessageId" class="sr-only">{{ title }}</h2>
        <h1 v-else class="sr-only">{{ title }}</h1>
        <div class="flex w-full min-w-0 items-center gap-3">
          <UTooltip :text="t('list.selectAll')">
            <UCheckbox
              :model-value="allVisibleSelected"
              :disabled="messages.length === 0"
              :aria-label="t('list.selectAll')"
              @update:model-value="toggleAllVisible($event === true)"
            />
          </UTooltip>
          <MessagesBulkToolbar
            v-if="selectedIds.length > 0 && !compact"
            :selected-count="selectedIds.length"
            :has-unread-selection="hasUnreadSelection"
            :pending="pendingBulkAction"
            :folder="config.folderId ? undefined : config.folder"
            @action="runSelectedActionReportingErrors"
            @clear-selection="selectedMessages = []"
          />
          <p v-else-if="compact || isMobile" aria-hidden="true" class="truncate pl-1 font-semibold text-highlighted">{{ title }}</p>
        </div>
        <div v-if="selectedIds.length === 0 || compact" class="flex items-center gap-1 text-muted">
          <span class="whitespace-nowrap text-xs">{{ t('list.range', { start: pageRange.start, end: pageRange.end, total: pageRange.total }) }}</span>
          <UTooltip :text="t('list.previousPage')">
            <UButton
              icon="i-lucide-chevron-left"
              color="neutral"
              variant="ghost"
              size="sm"
              square
              :disabled="offset === 0 || isLoading"
              :aria-label="t('list.previousPage')"
              @click="offset = Math.max(offset - limit, 0)"
            />
          </UTooltip>
          <UTooltip :text="t('list.nextPage')">
            <UButton
              icon="i-lucide-chevron-right"
              color="neutral"
              variant="ghost"
              size="sm"
              square
              :disabled="offset + messages.length >= total || isLoading"
              :aria-label="t('list.nextPage')"
              @click="offset = offset + limit"
            />
          </UTooltip>
          <UTooltip v-if="config.folder === 'inbox'" :text="unreadOnly ? t('list.showingUnread') : t('list.showUnreadOnly')">
            <UButton
              icon="i-lucide-list-filter"
              :color="unreadOnly ? 'primary' : 'neutral'"
              :variant="unreadOnly ? 'soft' : 'ghost'"
              size="sm"
              square
              :aria-label="t('list.showUnreadOnly')"
              :aria-pressed="unreadOnly"
              @click="unreadOnly = !unreadOnly"
            />
          </UTooltip>
          <UTooltip v-if="permanentDeleteFolder" :text="emptyFolderLabel">
            <UButton
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              size="sm"
              class="text-xs font-medium"
              :aria-label="emptyFolderLabel"
              :disabled="emptyingFolder || isLoading || total === 0"
              @click="emptyFolder"
            >
              <span v-if="!compact" class="max-md:hidden">{{ emptyingFolder ? t('list.emptying') : emptyFolderLabel }}</span>
            </UButton>
          </UTooltip>
        </div>
      </div>
      <p v-if="actionError" role="alert" class="shrink-0 border-b border-error/20 bg-error/10 px-6 py-2 text-sm font-medium text-error">{{ actionError }}</p>
    </template>

    <template #body>
      <MessagesDueFollowUps v-if="config.folder === 'inbox' && !config.folderId && offset === 0 && !mailboxesLoading" :mailbox-id="selectedMailbox?.id" />
      <div role="list" :aria-label="title" class="divide-y divide-default">
        <MessagesListRow
          v-for="message in messages"
          :key="message.id"
          :message="message"
          :config="config"
          :selected="selectedIds.includes(message.id)"
          :active="message.id === selectedMessageId"
          :opening="message.id === visibleOpeningMessageId"
          :compact="compactRows"
          :current-account-name="currentAccountName"
          :drag-message-ids="dragIdsFor(message.id)"
          :on-message-action="onRowAction"
          @opening="markMessageOpening(message.id)"
          @selected-change="updateSelectedMessage"
        />
      </div>
      <div v-if="isLoading && messages.length === 0" class="space-y-px" aria-hidden="true">
        <div v-for="index in 8" :key="index" class="flex items-center gap-3 px-6 py-3">
          <USkeleton class="size-4" />
          <USkeleton class="h-4 w-40" />
          <USkeleton class="h-4 flex-1" />
        </div>
      </div>
      <p v-if="!isLoading && messages.length === 0" class="px-6 py-4 text-sm text-muted">
        {{ hasActiveFilters ? t('list.noMatch') : config.emptyTextKey ? t(config.emptyTextKey) : config.emptyText }}
      </p>
    </template>
  </UDashboardPanel>
</template>
