<script setup lang="ts">
// Hover actions on a full-width inbox or snoozed row. Ported from message-list-row-actions.tsx.
import type { Message } from '~/types/messages'
import type { RowMessageAction } from '~/utils/messages/types'
import { isMessageSnoozed, unsnoozeMessage } from '~/utils/messages/row-actions-utils'

const props = defineProps<{ message: Message }>()
const emit = defineEmits<{ action: [action: RowMessageAction] }>()
const { t } = useLanguage()
const snoozeOpen = ref(false)
const snoozed = computed(() => isMessageSnoozed(props.message.snoozedUntil))
const readAction = computed<RowMessageAction>(() => (props.message.read ? 'unread' : 'read'))
const readLabel = computed(() => (readAction.value === 'read' ? t('common.markRead') : t('common.markUnread')))

function onSnooze() {
  if (snoozed.value) {
    void unsnoozeMessage(props.message.id)
    return
  }
  snoozeOpen.value = true
}
</script>

<template>
  <div class="pointer-events-none absolute right-6 top-1/2 z-10 flex -translate-y-1/2 items-center gap-1 bg-elevated pl-3 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
    <MessagesUnsubscribeButton v-if="message.hasUnsubscribe" :key="message.id" :message-id="message.id" variant="row" />
    <UTooltip :text="t('common.archive')">
      <UButton icon="i-lucide-archive" color="neutral" variant="ghost" size="sm" square :aria-label="t('common.archive')" @click="emit('action', 'archive')" />
    </UTooltip>
    <UTooltip :text="t('common.trash')">
      <UButton icon="i-lucide-trash-2" color="neutral" variant="ghost" size="sm" square :aria-label="t('common.trash')" @click="emit('action', 'trash')" />
    </UTooltip>
    <UTooltip :text="readLabel">
      <UButton :icon="readAction === 'read' ? 'i-lucide-mail-open' : 'i-lucide-mail'" color="neutral" variant="ghost" size="sm" square :aria-label="readLabel" @click="emit('action', readAction)" />
    </UTooltip>
    <UTooltip :text="snoozed ? t('common.unsnooze') : t('common.snooze')">
      <UButton icon="i-lucide-clock" color="neutral" variant="ghost" size="sm" square :aria-label="snoozed ? t('common.unsnooze') : t('common.snooze')" @click="onSnooze" />
    </UTooltip>
    <MessagesSnoozeModal v-model:open="snoozeOpen" :message-id="message.id" />
  </div>
</template>
