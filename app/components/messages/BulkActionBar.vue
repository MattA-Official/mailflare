<script setup lang="ts">
// Bulk actions for a selection whose messages are listed in the split-view sidebar. It sits above
// the focused message instead of replacing it. Ported from bulk-message-action-bar.tsx.
import type { BulkMessageAction } from '#handlers/api/messages/bulk/types'
import { PartialDeleteError } from '#lib/messages/permanent-delete-utils'
import { runBulkMessageAction } from '~/utils/messages/list-utils'
import type { MessageFolder } from '~/types/messages'
import type { SelectedMessage } from '~/utils/messages/types'

const props = defineProps<{ folder?: MessageFolder, selectedMessages: SelectedMessage[] }>()
const emit = defineEmits<{ clearSelection: [] }>()
const { t } = useLanguage()
const pending = ref(false)
const error = ref<string | null>(null)
const hasUnreadSelection = computed(() => props.selectedMessages.some(message => !message.read))

async function runAction(action: BulkMessageAction, folderId?: string) {
  if (props.selectedMessages.length === 0) return
  pending.value = true
  error.value = null
  try {
    await runBulkMessageAction(props.selectedMessages.map(message => message.id), action, true, folderId)
    emit('clearSelection')
  }
  catch (actionError) {
    error.value = actionError instanceof PartialDeleteError ? t('actions.error.deleteSkipped') : t('actions.error.update')
  }
  finally {
    pending.value = false
  }
}
</script>

<template>
  <div role="region" :aria-label="t('common.selectedCount', { count: selectedMessages.length })" class="shrink-0 border-b border-default bg-primary/5 px-3 py-2">
    <div class="min-w-0 overflow-x-auto">
      <MessagesBulkToolbar
        :selected-count="selectedMessages.length"
        :has-unread-selection="hasUnreadSelection"
        :pending="pending"
        :folder="folder"
        @action="runAction"
        @clear-selection="emit('clearSelection')"
      />
    </div>
    <p v-if="error" role="alert" class="mt-1 text-sm font-medium text-error">{{ error }}</p>
  </div>
</template>
