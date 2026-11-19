<script setup lang="ts">
// Hover actions on a list row, adapted to the folder on screen: a rail on full-width rows and a
// small pill (primary action plus a menu) on compact rows beside an open message.
// Ported from message-list-row-actions.tsx.
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Message, MessageFolder } from '~/types/messages'
import type { RowMessageAction } from '~/utils/messages/types'
import { confirmDestructive } from '~/utils/confirm-dialog'
import { getPermanentDeleteConfirmText } from '#lib/messages/permanent-delete-utils'
import { isMessageSnoozed, unsnoozeMessage } from '~/utils/messages/row-actions-utils'

const props = withDefaults(defineProps<{
  message: Message
  folder?: MessageFolder
  folderId?: string
  /** Tighter pill for the split-view message list. */
  compact?: boolean
  /** The row holds the open message, so the pill uses the active-row surface. */
  active?: boolean
}>(), { folder: 'inbox', folderId: undefined, compact: false, active: false })
const emit = defineEmits<{
  action: [action: RowMessageAction]
  snoozeChange: [messageId: string, snoozed: boolean]
}>()
const { t } = useLanguage()
const snoozeOpen = ref(false)
const snoozing = ref(false)
const snoozed = computed(() => isMessageSnoozed(props.message.snoozedUntil))
const readAction = computed<RowMessageAction>(() => (props.message.read ? 'unread' : 'read'))
const readLabel = computed(() => (readAction.value === 'read' ? t('common.markRead') : t('common.markUnread')))
const snoozeLabel = computed(() => (snoozed.value ? t('common.unsnooze') : t('common.snooze')))

// The row leaves these folders through a state change, so offering the same move as a secondary
// action would be a no-op or a misleading duplicate.
const canMarkRead = computed(() => props.folder !== 'spam' && props.folder !== 'trash')
const canSnooze = computed(() => props.folder === 'inbox' && !props.folderId)
const canArchive = computed(() => props.folder === 'snoozed')
const canTrash = computed(() => props.folder !== 'spam' && props.folder !== 'trash')
const canDeleteForever = computed(() => props.folder === 'spam' || props.folder === 'trash')

async function handleUnsnooze() {
  snoozing.value = true
  try {
    await unsnoozeMessage(props.message.id)
    emit('snoozeChange', props.message.id, false)
  }
  catch {
    // The action client reports failures; the row stays as it was.
  }
  finally {
    snoozing.value = false
  }
}

function onSnooze() {
  if (snoozed.value) {
    void handleUnsnooze()
    return
  }
  snoozeOpen.value = true
}

async function handleDeleteForever() {
  // A row only deletes the thread members in this folder, not every message the conversation
  // contains elsewhere.
  const count = props.message.threadMessageIds?.length ?? 1
  if (!await confirmDestructive(getPermanentDeleteConfirmText(count, t))) return
  emit('action', 'delete')
}

const primary = computed<{ label: string, icon: string, run: () => void, disabled?: boolean }>(() => {
  if (props.folder === 'snoozed') return { label: t('common.unsnooze'), icon: 'i-lucide-clock', run: () => void handleUnsnooze(), disabled: snoozing.value }
  if (props.folder === 'archived') return { label: t('common.unarchive'), icon: 'i-lucide-archive-restore', run: () => emit('action', 'inbox') }
  if (props.folder === 'spam') return { label: t('common.notSpam'), icon: 'i-lucide-shield-check', run: () => emit('action', 'inbox') }
  if (props.folder === 'trash') return { label: t('common.restore'), icon: 'i-lucide-undo-2', run: () => emit('action', 'inbox') }
  return { label: t('common.archive'), icon: 'i-lucide-archive', run: () => emit('action', 'archive') }
})

const menuItems = computed<DropdownMenuItem[][]>(() => {
  const main: DropdownMenuItem[] = []
  if (canMarkRead.value) main.push({ label: readLabel.value, icon: readAction.value === 'read' ? 'i-lucide-mail-open' : 'i-lucide-mail', onSelect: () => emit('action', readAction.value) })
  if (canSnooze.value) main.push({ label: snoozeLabel.value, icon: 'i-lucide-clock', disabled: snoozing.value, onSelect: onSnooze })
  if (canArchive.value) main.push({ label: t('common.archive'), icon: 'i-lucide-archive', onSelect: () => emit('action', 'archive') })
  const destructive: DropdownMenuItem[] = []
  if (canTrash.value) destructive.push({ label: t('common.trash'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => emit('action', 'trash') })
  if (canDeleteForever.value) destructive.push({ label: t('common.deleteForever'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => void handleDeleteForever() })
  return [main, destructive].filter(group => group.length > 0)
})
</script>

<template>
  <div
    v-if="compact"
    class="pointer-events-none absolute right-2 top-1/2 z-10 flex h-8 -translate-y-1/2 items-center gap-0.5 rounded-full p-0.5 opacity-0 shadow-sm ring-1 ring-default transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 has-data-[state=open]:pointer-events-auto has-data-[state=open]:opacity-100"
    :class="active ? 'bg-primary/10 backdrop-blur' : 'bg-elevated'"
  >
    <MessagesUnsubscribeButton v-if="message.hasUnsubscribe" :key="message.id" :message-id="message.id" variant="row" icon-only />
    <UTooltip :text="primary.label">
      <UButton :icon="primary.icon" color="neutral" variant="ghost" size="xs" square :disabled="primary.disabled" :aria-label="primary.label" @click="primary.run" />
    </UTooltip>
    <UDropdownMenu :items="menuItems" :content="{ align: 'end' }">
      <UButton icon="i-lucide-ellipsis-vertical" color="neutral" variant="ghost" size="xs" square :aria-label="t('common.moreActions')" />
    </UDropdownMenu>
    <MessagesSnoozeModal v-model:open="snoozeOpen" :message-id="message.id" @snoozed="emit('snoozeChange', message.id, true)" />
  </div>
  <div
    v-else
    class="pointer-events-none absolute right-6 top-1/2 z-10 flex -translate-y-1/2 items-center gap-1 bg-elevated pl-3 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
  >
    <MessagesUnsubscribeButton v-if="message.hasUnsubscribe" :key="message.id" :message-id="message.id" variant="row" />
    <UTooltip :text="primary.label">
      <UButton :icon="primary.icon" color="neutral" variant="ghost" size="sm" square :disabled="primary.disabled" :aria-label="primary.label" @click="primary.run" />
    </UTooltip>
    <UTooltip v-if="canArchive" :text="t('common.archive')">
      <UButton icon="i-lucide-archive" color="neutral" variant="ghost" size="sm" square :aria-label="t('common.archive')" @click="emit('action', 'archive')" />
    </UTooltip>
    <UTooltip v-if="canTrash" :text="t('common.trash')">
      <UButton icon="i-lucide-trash-2" color="neutral" variant="ghost" size="sm" square :aria-label="t('common.trash')" @click="emit('action', 'trash')" />
    </UTooltip>
    <UTooltip v-if="canDeleteForever" :text="t('common.deleteForever')">
      <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" square :aria-label="t('common.deleteForever')" @click="handleDeleteForever" />
    </UTooltip>
    <UTooltip v-if="canMarkRead" :text="readLabel">
      <UButton :icon="readAction === 'read' ? 'i-lucide-mail-open' : 'i-lucide-mail'" color="neutral" variant="ghost" size="sm" square :aria-label="readLabel" @click="emit('action', readAction)" />
    </UTooltip>
    <UTooltip v-if="canSnooze" :text="snoozeLabel">
      <UButton icon="i-lucide-clock" color="neutral" variant="ghost" size="sm" square :disabled="snoozing" :aria-label="snoozeLabel" @click="onSnooze" />
    </UTooltip>
    <MessagesSnoozeModal v-model:open="snoozeOpen" :message-id="message.id" @snoozed="emit('snoozeChange', message.id, true)" />
  </div>
</template>
