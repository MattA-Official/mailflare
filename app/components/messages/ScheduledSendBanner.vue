<script setup lang="ts">
// Shown above a scheduled message: rescheduling moves the send time, editing or cancelling
// returns it to Drafts. Ported from scheduled-send-banner.tsx and scheduled-send-reschedule.tsx.
import { alertDialog } from '~/utils/confirm-dialog'
import { getUserTimeZone } from '#lib/time/utils'
import { authFetch } from '~/utils/auth-client'
import { formatDateTimeLocal, formatScheduledSend, formatScheduledSendTime, getScheduleSendOptions, isPastSchedule, parseDateTimeLocal } from '~/utils/compose/schedule-send-utils'
import { clearMessageDetailCache } from '~/utils/messages/detail-cache'

const props = defineProps<{ messageId: string, scheduledAt: string }>()
const emit = defineEmits<{ rescheduled: [scheduledAt: string] }>()
const { t } = useLanguage()
const { openDraftComposer } = useCompose()
const cancelling = ref(false)
const rescheduling = ref(false)
const menuOpen = ref(false)
const pickedText = ref<string | null>(null)
const options = computed(() => (menuOpen.value ? getScheduleSendOptions() : []))
const picked = computed(() => (pickedText.value === null ? null : parseDateTimeLocal(pickedText.value)))
const pastPicked = computed(() => picked.value !== null && isPastSchedule(picked.value))
const busy = computed(() => cancelling.value || rescheduling.value)

watch(menuOpen, () => {
  pickedText.value = null
})

async function cancelSend(edit: boolean) {
  cancelling.value = true
  try {
    const response = await authFetch(`/api/messages/${props.messageId}/cancel-schedule`, { method: 'POST' })
    if (!response.ok) throw new Error('Unable to cancel')
    clearMessageDetailCache()
    window.dispatchEvent(new Event('mailflare:messages-changed'))
    await navigateTo('/drafts')
    if (edit) openDraftComposer(props.messageId)
  }
  catch {
    void alertDialog(t('schedule.cancelFailed'))
    cancelling.value = false
  }
}

async function reschedule(date: Date) {
  menuOpen.value = false
  rescheduling.value = true
  try {
    const response = await authFetch(`/api/messages/${props.messageId}/reschedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduledAt: date.toISOString() }),
    })
    if (!response.ok) throw new Error('Unable to reschedule')
    clearMessageDetailCache()
    window.dispatchEvent(new Event('mailflare:messages-changed'))
    emit('rescheduled', date.toISOString())
  }
  catch {
    void alertDialog(t('schedule.rescheduleFailed'))
  }
  finally {
    rescheduling.value = false
  }
}

// The date input fires change for every valid half-typed value, so the time is committed once,
// on Enter or when the field loses focus.
function commit() {
  if (pickedText.value === null) return
  const parsed = parseDateTimeLocal(pickedText.value)
  if (!parsed || isPastSchedule(parsed) || parsed.getTime() === new Date(props.scheduledAt).getTime()) return
  void reschedule(parsed)
}
</script>

<template>
  <div class="mb-2 flex flex-wrap items-center gap-3 rounded-lg bg-elevated px-4 py-3 text-sm text-toned">
    <UIcon name="i-lucide-calendar-clock" class="size-5 shrink-0 text-muted" />
    <span class="min-w-0 flex-1">{{ t('schedule.sendScheduledFor', { when: formatScheduledSendTime(scheduledAt, t) }) }}</span>
    <UPopover v-model:open="menuOpen" :content="{ align: 'end', sideOffset: 6 }">
      <UButton variant="link" size="sm" class="px-0 font-medium" :disabled="busy" :label="t('schedule.reschedule')" />
      <template #content>
        <div class="min-w-56 p-1 text-sm">
          <button
            v-for="option in options"
            :key="option.labelKey"
            type="button"
            class="flex w-full cursor-pointer items-baseline rounded-md px-3 py-2 text-left hover:bg-elevated focus:bg-elevated focus:outline-none"
            @click="option.value && reschedule(option.value)"
          >
            {{ t(option.labelKey) }}
            <span class="ml-2 text-xs text-muted">{{ option.value && formatScheduledSend(option.value) }}</span>
          </button>
          <USeparator class="my-1" />
          <p class="px-3 pb-1 pt-2 text-xs font-medium text-muted">{{ t('schedule.pick', { timeZone: getUserTimeZone() }) }}</p>
          <input
            type="datetime-local"
            :min="formatDateTimeLocal(new Date())"
            :value="pickedText ?? formatDateTimeLocal(new Date(scheduledAt))"
            :aria-invalid="pastPicked"
            class="mx-2 mb-2 h-9 rounded-md border border-default bg-default px-2 text-sm outline-none focus:border-primary"
            @input="pickedText = ($event.target as HTMLInputElement).value"
            @blur="commit"
            @keydown.stop="$event.key === 'Enter' && commit()"
          >
          <p v-if="pastPicked" role="alert" class="mx-2 mb-2 text-xs text-error">{{ t('schedule.pastTime') }}</p>
        </div>
      </template>
    </UPopover>
    <UButton variant="link" size="sm" class="px-0 font-medium" :disabled="busy" :label="t('agent.activity.editDraft')" @click="cancelSend(true)" />
    <UButton variant="link" size="sm" class="px-0 font-medium" :disabled="busy" :label="t('schedule.cancelSend')" @click="cancelSend(false)" />
  </div>
</template>
