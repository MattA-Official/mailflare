<script setup lang="ts">
// Answers a pending invitation from the calendar: Accept, Maybe or Decline.
// Ported from legacy/src/app/(calendar)/calendar/invite-response-dialog.tsx.
import type { CalendarEvent } from '~/types/calendar'
import { authFetch } from '~/utils/auth-client'
import { formatEventRange } from '~/utils/calendar/calendar'

type Answer = 'accepted' | 'tentative' | 'declined'

const props = defineProps<{ event: CalendarEvent | null }>()
const emit = defineEmits<{ close: [], answered: [] }>()
const { t } = useLanguage()
const toast = useToast()
const pending = ref<Answer | null>(null)

async function respond(answer: Answer) {
  const messageId = props.event?.inviteMessageId
  if (!messageId) return
  pending.value = answer
  try {
    const response = await authFetch(`/api/messages/${messageId}/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response: answer }),
    })
    const data = await response.json().catch(() => ({})) as { error?: string }
    if (!response.ok) throw new Error(data.error ?? t('invite.failed'))
    toast.add({ title: answer === 'declined' ? t('invite.declined') : t('invite.added'), color: 'success' })
    emit('answered')
    emit('close')
  }
  catch (error) {
    toast.add({ title: error instanceof Error ? error.message : t('invite.failed'), color: 'error' })
  }
  finally {
    pending.value = null
  }
}
</script>

<template>
  <UModal
    :open="event !== null"
    :title="event?.title ?? ''"
    :description="t('invite.pending')"
    :ui="{ content: 'max-h-[calc(100vh-4rem)] max-w-md overflow-y-auto', title: 'break-words' }"
    @update:open="(open: boolean) => { if (!open) emit('close') }"
  >
    <template v-if="event" #body>
      <div class="space-y-1 text-sm text-default">
        <p>{{ formatEventRange(event) }}</p>
        <p v-if="event.location" class="break-words text-muted">
          {{ event.location }}
        </p>
        <p v-if="event.description" class="break-words whitespace-pre-wrap text-muted">
          {{ event.description }}
        </p>
      </div>
      <div class="mt-4 flex flex-wrap items-center gap-2">
        <UButton :label="t('invite.accept')" :loading="pending === 'accepted'" :disabled="pending !== null" @click="respond('accepted')" />
        <UButton :label="t('invite.maybe')" color="neutral" variant="outline" :loading="pending === 'tentative'" :disabled="pending !== null" @click="respond('tentative')" />
        <UButton :label="t('invite.decline')" color="neutral" variant="outline" :loading="pending === 'declined'" :disabled="pending !== null" @click="respond('declined')" />
        <ULink :to="`/inbox/${event.inviteMessageId}`" class="text-sm font-medium text-primary hover:underline">
          {{ t('invite.openMessage') }}
        </ULink>
      </div>
    </template>
  </UModal>
</template>
