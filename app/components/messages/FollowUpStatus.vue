<script setup lang="ts">
// Reminder state of a sent message, with a way to set, move or remove it.
// Ported from legacy/src/components/follow-ups/message-follow-up-status.tsx.
import type { MessageFollowUp } from '#lib/follow-ups/types'
import { formatUserDate } from '#lib/time/utils'
import { clearMessageFollowUp, fetchMessageFollowUp, FOLLOW_UPS_CHANGED_EVENT, setMessageFollowUp } from '~/utils/messages/follow-up-client-utils'

const props = defineProps<{ messageId: string }>()
const { t } = useLanguage()
const followUp = shallowRef<MessageFollowUp | null | undefined>(undefined)
const failed = ref(false)
const DATE_FORMAT: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }

function load() {
  void fetchMessageFollowUp(props.messageId).then((value) => {
    followUp.value = value
  }).catch(() => {
    followUp.value = null
  })
}
watch(() => props.messageId, load, { immediate: true })
onMounted(() => window.addEventListener(FOLLOW_UPS_CHANGED_EVENT, load))
onBeforeUnmount(() => window.removeEventListener(FOLLOW_UPS_CHANGED_EVENT, load))

function run(action: Promise<void>) {
  failed.value = false
  void action.catch(() => {
    failed.value = true
  })
}
const open = computed(() => followUp.value?.status === 'pending' || followUp.value?.status === 'due')
</script>

<template>
  <p v-if="followUp !== undefined" class="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
    <template v-if="followUp?.status === 'replied'">
      <UIcon name="i-lucide-check" class="size-3.5" aria-hidden="true" />
      {{ t('followUp.replied') }}
    </template>
    <template v-else-if="open && followUp">
      <UIcon name="i-lucide-bell-ring" class="size-3.5 text-warning" aria-hidden="true" />
      {{ followUp.status === 'due' ? t('followUp.noReplyYet') : t('followUp.scheduledFor', { date: formatUserDate(followUp.dueAt, DATE_FORMAT) }) }}
      <ComposeFollowUpMenu clearable @pick="days => run(setMessageFollowUp(messageId, days))" @clear="run(clearMessageFollowUp(messageId))">
        <button type="button" class="font-medium text-primary hover:underline disabled:opacity-50">{{ t('followUp.change') }}</button>
      </ComposeFollowUpMenu>
    </template>
    <ComposeFollowUpMenu v-else @pick="days => run(setMessageFollowUp(messageId, days))">
      <button type="button" class="inline-flex items-center gap-1.5 hover:text-highlighted">
        <UIcon name="i-lucide-bell-ring" class="size-3.5" aria-hidden="true" />
        {{ t('followUp.remindMe') }}
      </button>
    </ComposeFollowUpMenu>
    <span v-if="failed" role="alert" class="text-error">{{ t('followUp.failed') }}</span>
  </p>
</template>
