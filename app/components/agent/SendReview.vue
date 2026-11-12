<script setup lang="ts">
// Confirmation step before an AI-written draft is sent or scheduled.
// Ported from legacy/src/components/agent/send-review.tsx.
import { htmlToPlainText } from '#lib/_app/rich-text-utils'
import { formatUserDate } from '#lib/time/utils'
import type { ReviewSnapshot } from '~/types/agent/send-review'

const props = defineProps<{
  approvalId: string
  snapshot: ReviewSnapshot
  /** Recipients that are not saved contacts or people the user has written to before. */
  unfamiliarRecipients?: string[]
  /** Declared as a prop so the Cancel button only shows when a parent listens for `close`. */
  onClose?: () => void
}>()
const emit = defineEmits<{ sent: [messageId: string] }>()

const { t } = useLanguage()
const fetched = ref<string[]>([])
const unfamiliar = computed(() => props.unfamiliarRecipients ?? fetched.value)
const busy = ref(false)
const error = ref<string | null>(null)
const scheduled = computed(() => !!props.snapshot.scheduledAt)
const body = computed(() => props.snapshot.text || htmlToPlainText(props.snapshot.html || ''))

watch(() => [props.approvalId, props.unfamiliarRecipients] as const, async ([id, provided]) => {
  if (provided) return
  // Callers that only hold the snapshot still get the "never written to" warning.
  try {
    const data = await api<{ unfamiliarRecipients?: string[] }>(`/api/agent/approvals/${id}`)
    fetched.value = data.unfamiliarRecipients ?? []
  } catch { /* the warning is best effort */ }
}, { immediate: true })

async function confirm() {
  busy.value = true
  error.value = null
  try {
    const response = await authFetch(`/api/agent/approvals/${props.approvalId}/confirm`, { method: 'POST' })
    const result = await response.json().catch(() => ({})) as { status?: string, messageId?: string, error?: string }
    if (!response.ok || result.status !== 'sent' || !result.messageId) throw new Error(result.error || t('agent.review.deliveryNeedsReview'))
    window.dispatchEvent(new Event('mailflare:messages-changed'))
    emit('sent', result.messageId)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('agent.review.couldNotSend')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UModal
    :open="true"
    :dismissible="!!onClose && !busy"
    :close="false"
    :title="scheduled ? t('agent.review.reviewSchedule') : t('agent.review.reviewSend')"
    :description="scheduled ? t('agent.review.confirmScheduled') : t('agent.review.confirmDelivered')"
    :ui="{ content: 'sm:max-w-2xl' }"
    @update:open="(value: boolean) => { if (!value) onClose?.() }"
  >
    <template #body>
      <div class="space-y-3 text-sm">
        <UAlert color="warning" variant="subtle" :title="t('agent.review.aiWritten')" />
        <UAlert v-if="unfamiliar.length" color="error" variant="subtle" role="alert" :title="t('agent.review.unfamiliarRecipients', { list: unfamiliar.join(', ') })" />
        <dl class="grid grid-cols-[5rem_1fr] gap-2 break-words">
          <dt class="text-muted">{{ t('agent.review.from') }}</dt><dd>{{ snapshot.from }}</dd>
          <dt class="text-muted">{{ t('agent.review.to') }}</dt><dd>{{ snapshot.to }}</dd>
          <template v-if="snapshot.cc"><dt class="text-muted">{{ t('agent.review.cc') }}</dt><dd>{{ snapshot.cc }}</dd></template>
          <template v-if="snapshot.bcc"><dt class="text-muted">{{ t('agent.review.bcc') }}</dt><dd>{{ snapshot.bcc }}</dd></template>
          <dt class="text-muted">{{ t('agent.review.subject') }}</dt><dd>{{ snapshot.subject }}</dd>
          <template v-if="snapshot.scheduledAt">
            <dt class="text-muted">{{ t('agent.review.sendAt') }}</dt>
            <dd>{{ formatUserDate(snapshot.scheduledAt, { dateStyle: 'medium', timeStyle: 'short' }) }}</dd>
          </template>
        </dl>
        <pre class="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-default p-3 font-sans">{{ body }}</pre>
        <p v-if="snapshot.attachments.length">
          {{ t('agent.review.attachments', { list: snapshot.attachments.map(item => `${item.filename} (${Math.max(1, Math.round(item.size / 1024))} KB)`).join(', ') }) }}
        </p>
        <p v-if="error" role="alert" class="text-error">{{ error }}</p>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-3">
        <UButton v-if="onClose" color="neutral" variant="outline" :label="t('common.cancel')" :disabled="busy" @click="onClose()" />
        <UButton
          :loading="busy"
          :label="busy ? (scheduled ? t('agent.review.scheduling') : t('agent.review.sending')) : (scheduled ? t('agent.review.confirmSchedule') : t('agent.review.confirmSend'))"
          @click="confirm()"
        />
      </div>
    </template>
  </UModal>
</template>
