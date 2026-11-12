<script setup lang="ts">
// Messages typed while the assistant is still working; each can be edited, removed or sent next.
// Ported from legacy/src/components/agent/queued-messages.tsx.
import type { QueuedAgentMessage } from '~/types/agent/agent'

defineProps<{ messages: QueuedAgentMessage[], running: boolean }>()
const emit = defineEmits<{ remove: [id: string], edit: [id: string, text: string], steer: [id: string] }>()
const { t } = useLanguage()
const editingId = ref<string | null>(null)
const editText = ref('')

function save(id: string) {
  if (!editText.value.trim()) return
  emit('edit', id, editText.value)
  editingId.value = null
}
</script>

<template>
  <div v-if="messages.length" class="mx-auto w-full max-w-3xl px-3" :aria-label="t('agent.queue.label')">
    <div class="max-h-48 overflow-y-auto rounded-t-2xl border border-b-0 border-primary/20 bg-primary/5 px-2 py-1 shadow-sm">
      <div v-for="item in messages" :key="item.id" class="flex min-w-0 items-center gap-2 rounded-xl px-2 py-2 text-sm hover:bg-default/70">
        <UIcon name="i-lucide-corner-down-right" class="size-4 shrink-0 text-dimmed" aria-hidden="true" />
        <form v-if="editingId === item.id" class="flex min-w-0 flex-1 items-center gap-2" @submit.prevent="save(item.id)">
          <UTextarea v-model="editText" autofocus :rows="2" class="min-w-0 flex-1" :aria-label="t('agent.queue.edit')" />
          <UButton type="submit" variant="link" size="sm" :disabled="!editText.trim()" :label="t('settings.autoReply.save')" />
          <UButton color="neutral" variant="link" size="sm" :label="t('common.cancel')" @click="editingId = null" />
        </form>
        <template v-else>
          <span class="min-w-0 flex-1 truncate" :title="item.text">{{ item.text }}</span>
          <UButton color="neutral" variant="ghost" size="xs" :title="running ? t('agent.queue.steerTitle') : t('agent.queue.sendNowTitle')" :label="running ? t('agent.queue.steer') : t('agent.queue.sendNow')" @click="emit('steer', item.id)" />
          <UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-pencil" :aria-label="t('agent.queue.edit')" :title="t('agent.queue.edit')" @click="editingId = item.id; editText = item.text" />
          <UButton color="error" variant="ghost" size="xs" icon="i-lucide-trash-2" :aria-label="t('agent.queue.remove')" :title="t('agent.queue.remove')" @click="emit('remove', item.id)" />
        </template>
      </div>
    </div>
  </div>
</template>
