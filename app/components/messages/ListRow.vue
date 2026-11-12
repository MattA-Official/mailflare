<script setup lang="ts">
// One row of a folder list, in the full-width or the compact (split view and phone) layout.
// Ported from MessageListRow in message-folder-page.tsx.
import { setMessageDragData } from '#lib/messages/drag-utils'
import { formatScheduledSendTime } from '~/utils/compose/schedule-send-utils'
import { useMessageNavigation } from '~/composables/messages/useMessageNavigation'
import { rememberOpenedUnreadMessage } from '~/utils/messages/detail-navigation-utils'
import {
  formatMessageListTimestamp,
  getMessageParty,
  getMessagePartyClassName,
  getMessagePreview,
  getUnreadFlipCount,
  isMessageListRowUnread,
  runBulkMessageAction,
} from '~/utils/messages/list-utils'
import { dispatchMessageCountsDelta, toggleMessageStar } from '~/utils/messages/row-actions-utils'
import type { Message } from '~/types/messages'
import type { MessageFolderConfig, RowMessageAction } from '~/utils/messages/types'

const props = withDefaults(defineProps<{
  message: Message
  config: MessageFolderConfig
  selected: boolean
  active?: boolean
  opening?: boolean
  compact?: boolean
  currentAccountName?: string | null
  dragMessageIds: string[]
  onMessageAction: (messageId: string, action: RowMessageAction) => Promise<unknown>
}>(), { active: false, opening: false, compact: false, currentAccountName: undefined })

const emit = defineEmits<{
  selectedChange: [messageId: string, selected: boolean]
  opening: []
}>()

const { t } = useLanguage()
const read = ref(props.message.read)
const threadUnread = ref(props.message.threadUnread)
const starred = ref(props.message.starred)
watch(() => props.message.read, (value) => {
  read.value = value
})
watch(() => props.message.threadUnread, (value) => {
  threadUnread.value = value
})
watch(() => props.message.starred, (value) => {
  starred.value = value
})

const rowMessage = computed<Message>(() => ({ ...props.message, read: read.value, starred: starred.value, threadUnread: threadUnread.value }))
const unread = computed(() => isMessageListRowUnread(rowMessage.value))
const draggable = computed(() => props.config.folder === 'inbox' && props.message.direction === 'inbound')
const party = computed(() => getMessageParty(rowMessage.value, props.config.folder, props.currentAccountName ?? undefined, t))
const preview = computed(() => getMessagePreview(rowMessage.value, props.config.folder, t))
const href = computed(() => `${props.config.hrefPrefix}/${props.message.id}`)
const isDraft = computed(() => props.config.folder === 'drafts')
const navigation = useMessageNavigation(() => href.value, () => rowMessage.value)
const affectsInboxCount = computed(() => props.config.folder === 'inbox' && !props.config.folderId)
const swipeable = computed(() => props.compact && (props.config.folder === 'inbox' || props.config.folder === 'snoozed') && props.message.direction === 'inbound')
const showRowActions = computed(() => (props.config.folder === 'inbox' || props.config.folder === 'snoozed') && props.message.direction === 'inbound')
const starrable = computed(() => props.config.folder === 'inbox' && props.message.direction === 'inbound')
const timestamp = computed(() => (props.message.scheduledAt ? formatScheduledSendTime(props.message.scheduledAt, t) : formatMessageListTimestamp(props.message.createdAt)))
const threadCount = computed(() => props.message.threadCount ?? 1)

async function runRowAction(action: RowMessageAction) {
  const previousRead = read.value
  const previousThreadUnread = threadUnread.value
  const unreadDelta = !affectsInboxCount.value || (action !== 'read' && action !== 'unread')
    ? 0
    : getUnreadFlipCount(rowMessage.value, action === 'read') * (action === 'read' ? -1 : 1)
  if (action === 'read') read.value = true
  if (action === 'unread') read.value = false
  // Grouped rows derive their unread styling from the thread count, so it must change with the row.
  if (props.message.threadMessageIds) {
    if (action === 'read') threadUnread.value = 0
    if (action === 'unread') threadUnread.value = props.message.threadMessageIds.length
  }
  if (unreadDelta) dispatchMessageCountsDelta({ inboxUnreadDelta: unreadDelta })
  try {
    await props.onMessageAction(props.message.id, action)
  }
  catch (error) {
    if (action === 'read' || action === 'unread') {
      read.value = previousRead
      threadUnread.value = previousThreadUnread
      if (unreadDelta) dispatchMessageCountsDelta({ inboxUnreadDelta: -unreadDelta })
    }
    throw error
  }
}

function onMessageNavigate(event: MouseEvent) {
  if (isDraft.value) return
  const plainClick = !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
  if (plainClick) emit('opening')
  const wasUnread = !read.value
  if (wasUnread && plainClick) {
    rememberOpenedUnreadMessage(props.message.id)
    const previousThreadUnread = threadUnread.value
    read.value = true
    if (previousThreadUnread !== undefined) threadUnread.value = Math.max(0, previousThreadUnread - 1)
    const counted = affectsInboxCount.value && props.message.direction === 'inbound'
    if (counted) dispatchMessageCountsDelta({ inboxUnreadDelta: -1 })
    void runBulkMessageAction([props.message.id], 'read', false).catch(() => {
      read.value = false
      threadUnread.value = previousThreadUnread
      if (counted) dispatchMessageCountsDelta({ inboxUnreadDelta: 1 })
    })
  }
  navigation.onNavigate(event, wasUnread)
}

function onDragStart(event: DragEvent) {
  if (!draggable.value || !event.dataTransfer) return
  setMessageDragData(event.dataTransfer, { messageIds: props.dragMessageIds })
}

function prefetch() {
  if (!isDraft.value) navigation.prefetch()
}
function cancelPrefetch() {
  if (!isDraft.value) navigation.cancelPrefetch()
}
function prefetchNow() {
  if (!isDraft.value) navigation.prefetchNow()
}

async function toggleStar() {
  const result = await toggleMessageStar(props.message.id)
  starred.value = result.starred
}

const swipeStart = computed(() => ({
  label: read.value ? t('list.markUnread') : t('list.markRead'),
  icon: read.value ? 'i-lucide-mail' : 'i-lucide-mail-open',
  class: 'bg-info',
  onTrigger: () => void runRowAction(read.value ? 'unread' : 'read').catch(() => undefined),
}))
const swipeEnd = computed(() => ({
  label: t('common.archive'),
  icon: 'i-lucide-archive',
  class: 'bg-success',
  onTrigger: () => void runRowAction('archive').catch(() => undefined),
}))
</script>

<template>
  <!-- Compact: split-view sidebar and phones. -->
  <MessagesSwipeableRow v-if="compact && swipeable" role="listitem" :start-action="swipeStart" :end-action="swipeEnd">
    <div
      class="group grid grid-cols-[20px_minmax(0,1fr)] gap-3 border-l-2 px-4 py-3 transition-colors"
      :class="[
        active || opening ? 'border-l-primary bg-primary/10' : selected ? 'border-l-transparent bg-elevated' : 'border-l-transparent hover:bg-elevated',
        draggable && 'cursor-grab active:cursor-grabbing',
      ]"
      :draggable="draggable"
      @dragstart="onDragStart"
    >
      <UCheckbox class="mt-1" :model-value="selected" :aria-label="t('list.selectFrom', { sender: party })" @update:model-value="emit('selectedChange', message.id, $event === true)" />
      <NuxtLink
        :to="href"
        :aria-current="active ? 'true' : undefined"
        class="min-w-0"
        @click="onMessageNavigate"
        @pointerenter="prefetch"
        @pointerleave="cancelPrefetch"
        @focus="prefetch"
        @blur="cancelPrefetch"
        @touchstart.passive="prefetchNow"
      >
        <span class="flex items-baseline justify-between gap-3">
          <span :class="[unread && 'font-semibold', getMessagePartyClassName(rowMessage, config.folder)]">
            <span v-if="unread" class="sr-only">{{ t('list.unread') }} </span>
            {{ party }}
            <span v-if="threadCount > 1" class="ml-2 text-xs font-normal text-muted">{{ message.threadCount }}</span>
          </span>
          <span class="shrink-0 text-[11px]" :class="unread ? 'font-medium' : 'text-muted'">
            <MessagesOpenedIndicator :count="message.openCount" />
            {{ timestamp }}
          </span>
        </span>
        <span class="mt-1 block truncate text-sm" :class="unread ? 'font-semibold text-highlighted' : 'text-toned'">{{ message.subject ?? t('list.noSubject') }}</span>
        <span class="mt-0.5 block truncate text-xs leading-5 text-muted">{{ preview }}</span>
      </NuxtLink>
    </div>
  </MessagesSwipeableRow>

  <div
    v-else-if="compact"
    role="listitem"
    class="group grid grid-cols-[20px_minmax(0,1fr)] gap-3 border-l-2 px-4 py-3 transition-colors"
    :class="[
      active || opening ? 'border-l-primary bg-primary/10' : selected ? 'border-l-transparent bg-elevated' : 'border-l-transparent hover:bg-elevated',
      draggable && 'cursor-grab active:cursor-grabbing',
    ]"
    :draggable="draggable"
    @dragstart="onDragStart"
  >
    <UCheckbox class="mt-1" :model-value="selected" :aria-label="t('list.selectFrom', { sender: party })" @update:model-value="emit('selectedChange', message.id, $event === true)" />
    <NuxtLink
      :to="href"
      :aria-current="active ? 'true' : undefined"
      class="min-w-0"
      @click="onMessageNavigate"
      @pointerenter="prefetch"
      @pointerleave="cancelPrefetch"
      @focus="prefetch"
      @blur="cancelPrefetch"
      @touchstart.passive="prefetchNow"
    >
      <span class="flex items-baseline justify-between gap-3">
        <span :class="[unread && 'font-semibold', getMessagePartyClassName(rowMessage, config.folder)]">
          <span v-if="unread" class="sr-only">{{ t('list.unread') }} </span>
          {{ party }}
          <span v-if="threadCount > 1" class="ml-2 text-xs font-normal text-muted">{{ message.threadCount }}</span>
        </span>
        <span class="shrink-0 text-[11px]" :class="unread ? 'font-medium' : 'text-muted'">
          <MessagesOpenedIndicator :count="message.openCount" />
          {{ timestamp }}
        </span>
      </span>
      <span class="mt-1 block truncate text-sm" :class="unread ? 'font-semibold text-highlighted' : 'text-toned'">{{ message.subject ?? t('list.noSubject') }}</span>
      <span class="mt-0.5 block truncate text-xs leading-5 text-muted">{{ preview }}</span>
    </NuxtLink>
  </div>

  <!-- Full width. -->
  <div
    v-else
    role="listitem"
    class="group relative grid min-h-12 w-full grid-cols-[24px_32px_minmax(160px,80px)_1fr_auto] items-center gap-3 px-6 text-left text-sm hover:z-10 hover:bg-elevated hover:shadow-sm has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-inset has-[a:focus-visible]:ring-primary"
    :class="[(active || selected || opening) && 'bg-primary/10', !isDraft && draggable && 'cursor-grab active:cursor-grabbing']"
    :draggable="!isDraft && draggable"
    @dragstart="onDragStart"
  >
    <UCheckbox
      class="relative z-10"
      :model-value="selected"
      :aria-label="isDraft ? t('list.selectMessage') : t('list.selectFrom', { sender: party })"
      @update:model-value="emit('selectedChange', message.id, $event === true)"
    />
    <UTooltip v-if="starrable" :text="starred ? t('list.starred') : t('list.notStarred')">
      <UButton
        color="neutral"
        variant="ghost"
        size="sm"
        square
        class="relative z-10"
        :aria-label="t('message.star')"
        :aria-pressed="starred"
        @click="toggleStar"
      >
        <UIcon :name="config.icon" class="size-4" :class="starred ? 'text-warning [&]:fill-current' : 'text-dimmed'" />
      </UButton>
    </UTooltip>
    <UIcon v-else :name="config.icon" class="size-4 text-dimmed" />
    <span class="truncate" :class="[unread && 'font-semibold', getMessagePartyClassName(rowMessage, config.folder)]">
      <span v-if="unread" class="sr-only">{{ t('list.unread') }} </span>
      {{ party }}
      <span v-if="threadCount > 1" class="ml-2 text-xs text-muted">{{ message.threadCount }}</span>
    </span>
    <span class="truncate text-toned">
      <NuxtLink
        :to="href"
        :aria-current="active ? 'true' : undefined"
        class="after:absolute after:inset-0 focus-visible:outline-none"
        @click="onMessageNavigate"
        @pointerenter="prefetch"
        @pointerleave="cancelPrefetch"
        @focus="prefetch"
        @blur="cancelPrefetch"
        @touchstart.passive="prefetchNow"
      >
        <span :class="unread && 'font-semibold text-highlighted'">{{ rowMessage.subject ?? t('list.noSubject') }}</span>
        <span class="text-muted"> - {{ preview }}</span>
      </NuxtLink>
    </span>
    <time
      :datetime="message.createdAt"
      class="min-w-24 whitespace-nowrap text-right text-xs group-hover:opacity-0"
      :class="unread ? 'font-semibold text-highlighted' : 'text-muted'"
    >
      <MessagesOpenedIndicator :count="message.openCount" />
      {{ timestamp }}
    </time>
    <MessagesRowActions v-if="!isDraft && showRowActions" :message="rowMessage" @action="(action) => void runRowAction(action).catch(() => undefined)" />
  </div>
</template>
