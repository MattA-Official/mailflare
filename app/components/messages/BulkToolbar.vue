<script setup lang="ts">
// Actions for the selected rows. Ported from bulk-message-toolbar.tsx.
import type { DropdownMenuItem } from '@nuxt/ui'
import type { BulkMessageAction } from '#handlers/api/messages/bulk/types'
import { supportsPermanentDelete } from '#lib/messages/permanent-delete-utils'
import { useMailboxFolders } from '~/composables/messages/useMailboxFolders'
import type { MessageFolder } from '~/types/messages'

const props = withDefaults(defineProps<{
  selectedCount: number
  hasUnreadSelection: boolean
  hideSelectedCount?: boolean
  pending?: boolean
  folder?: MessageFolder
}>(), { hideSelectedCount: false, pending: false, folder: undefined })

const emit = defineEmits<{
  action: [action: BulkMessageAction, folderId?: string]
  clearSelection: []
}>()

const { t } = useLanguage()
const { selectedMailbox } = useSelectedMailbox()
const folders = useMailboxFolders(() => selectedMailbox.value?.id)

// In archived, spam and trash the usual button would be a no-op, so it becomes the way back to the inbox.
const archive = computed(() => (props.folder === 'archived'
  ? { action: 'inbox' as const, label: t('common.unarchive'), icon: 'i-lucide-archive-restore' }
  : { action: 'archive' as const, label: t('common.archive'), icon: 'i-lucide-archive' }))
const spam = computed(() => (props.folder === 'spam'
  ? { action: 'inbox' as const, label: t('common.notSpam'), icon: 'i-lucide-shield-check' }
  : { action: 'spam' as const, label: t('common.reportSpam'), icon: 'i-lucide-shield-alert' }))
const trash = computed(() => (props.folder === 'trash'
  ? { action: 'inbox' as const, label: t('common.restore'), icon: 'i-lucide-undo-2' }
  : { action: 'trash' as const, label: t('common.delete'), icon: 'i-lucide-trash-2' }))
// Trash and Spam also offer the irreversible delete; the page confirms before running it.
const canDeleteForever = computed(() => supportsPermanentDelete(props.folder))
const readLabel = computed(() => (props.hasUnreadSelection ? t('common.markRead') : t('common.markUnread')))

const moveItems = computed<DropdownMenuItem[][]>(() => {
  const builtIn: DropdownMenuItem[] = [
    { value: 'inbox', label: t('navigation.inbox'), icon: 'i-lucide-inbox', hidden: props.folder === 'inbox' },
    { value: 'archive', label: t('navigation.archived'), icon: 'i-lucide-archive', hidden: props.folder === 'archived' },
    { value: 'spam', label: t('navigation.spam'), icon: 'i-lucide-shield-alert', hidden: props.folder === 'spam' },
    { value: 'trash', label: t('navigation.trash'), icon: 'i-lucide-trash-2', hidden: props.folder === 'trash' },
  ].filter(option => !option.hidden).map(option => ({
    label: option.label,
    icon: option.icon,
    onSelect: () => emit('action', option.value as BulkMessageAction),
  }))
  const groups: DropdownMenuItem[][] = [builtIn]
  if (folders.value.length > 0) {
    groups.push([
      { type: 'label', label: t('navigation.folders') },
      ...folders.value.map(item => ({
        label: item.name,
        icon: 'i-lucide-folder',
        folderColor: item.color,
        onSelect: () => emit('action', 'folder', item.id),
      })),
    ])
  }
  return groups
})

const mobileItems = computed<DropdownMenuItem[][]>(() => [
  [
    { label: archive.value.label, icon: archive.value.icon, onSelect: () => emit('action', archive.value.action) },
    { label: spam.value.label, icon: spam.value.icon, onSelect: () => emit('action', spam.value.action) },
    ...(canDeleteForever.value ? [{ label: t('common.deleteForever'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => emit('action', 'delete') }] : []),
  ],
  [{ label: t('common.clearSelection'), icon: 'i-lucide-x', onSelect: () => emit('clearSelection') }],
])
</script>

<template>
  <div class="flex w-full min-w-0 items-center gap-2 text-toned">
    <span v-if="!hideSelectedCount" class="mr-2 whitespace-nowrap text-sm font-medium text-highlighted">
      {{ t('common.selectedCount', { count: selectedCount }) }}
    </span>
    <span class="flex-1 md:hidden" />
    <UTooltip :text="archive.label" class="max-md:hidden">
      <UButton :icon="archive.icon" color="neutral" variant="ghost" size="sm" square class="max-md:hidden" :disabled="pending" :aria-label="archive.label" @click="emit('action', archive.action)" />
    </UTooltip>
    <UTooltip :text="spam.label">
      <UButton :icon="spam.icon" color="neutral" variant="ghost" size="sm" square class="max-md:hidden" :disabled="pending" :aria-label="spam.label" @click="emit('action', spam.action)" />
    </UTooltip>
    <UTooltip :text="trash.label">
      <UButton :icon="trash.icon" color="neutral" variant="ghost" size="sm" square :disabled="pending" :aria-label="trash.label" @click="emit('action', trash.action)" />
    </UTooltip>
    <UTooltip v-if="canDeleteForever" :text="t('common.deleteForever')">
      <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" square :disabled="pending" :aria-label="t('common.deleteForever')" @click="emit('action', 'delete')" />
    </UTooltip>
    <UTooltip :text="readLabel">
      <UButton
        :icon="hasUnreadSelection ? 'i-lucide-mail-open' : 'i-lucide-mail'"
        color="neutral"
        variant="ghost"
        size="sm"
        square
        :disabled="pending"
        :aria-label="readLabel"
        @click="emit('action', hasUnreadSelection ? 'read' : 'unread')"
      />
    </UTooltip>
    <span class="flex-1 max-md:hidden" />
    <UDropdownMenu :items="moveItems" :content="{ align: 'end' }" class="max-md:hidden">
      <UButton
        icon="i-lucide-folder-input"
        trailing-icon="i-lucide-chevron-down"
        color="neutral"
        variant="ghost"
        size="sm"
        class="text-xs font-medium max-md:hidden"
        :label="t('common.moveTo')"
        :title="t('common.moveSelected')"
        :disabled="pending"
      />
      <template #item-leading="{ item }">
        <UIcon v-if="item.icon" :name="item.icon" class="size-5 shrink-0" :style="item.folderColor ? { color: item.folderColor } : undefined" />
      </template>
    </UDropdownMenu>
    <UTooltip :text="t('common.clearSelection')">
      <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" square class="max-md:hidden" :disabled="pending" :aria-label="t('common.clearSelection')" @click="emit('clearSelection')" />
    </UTooltip>
    <UDropdownMenu :items="mobileItems" :content="{ align: 'end' }">
      <UButton icon="i-lucide-ellipsis-vertical" color="neutral" variant="ghost" size="sm" square class="md:hidden" :disabled="pending" :aria-label="t('common.moreActions')" />
    </UDropdownMenu>
  </div>
</template>
