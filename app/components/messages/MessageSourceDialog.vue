<script setup lang="ts">
// "Show original": the raw MIME with a header and authentication summary.
// Ported from legacy/src/components/messages/message-source-dialog.tsx.
import { copyMessageSource, downloadMessageSource, fetchMessageSource, summarizeMessageSource } from '~/utils/messages/message-source-utils'

const props = defineProps<{ messageId: string }>()
const open = defineModel<boolean>('open', { default: false })
const { t } = useLanguage()
const source = ref<string | null>(null)
const error = ref<string | null>(null)
const loading = ref(false)
const copied = ref(false)
const copyError = ref(false)
const summary = computed(() => (source.value === null ? null : summarizeMessageSource(source.value)))
const rows = computed(() => summary.value
  ? ([
      ['messageId', summary.value.messageId],
      ['createdAt', summary.value.createdAt],
      ['from', summary.value.from],
      ['to', summary.value.to],
      ['subject', summary.value.subject],
    ] as const)
  : [])

watch([open, () => props.messageId], ([isOpen, id], _previous, onCleanup) => {
  if (!isOpen) return
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  source.value = null
  error.value = null
  copied.value = false
  copyError.value = false
  loading.value = true
  fetchMessageSource(id, controller.signal)
    .then((value) => {
      if (!controller.signal.aborted) source.value = value
    })
    .catch((reason) => {
      if (!controller.signal.aborted) error.value = reason instanceof Error ? reason.message : t('source.loadFailed')
    })
    .finally(() => {
      if (!controller.signal.aborted) loading.value = false
    })
}, { immediate: true })

function copy() {
  if (source.value === null) return
  copyMessageSource(source.value)
    .then(() => {
      copied.value = true
      copyError.value = false
    })
    .catch(() => {
      copied.value = false
      copyError.value = true
    })
}
</script>

<template>
  <UModal v-model:open="open" :title="t('source.title')" :description="t('source.description')" :ui="{ content: 'sm:max-w-4xl' }">
    <template #body>
      <div v-if="loading" class="flex items-center gap-2 text-sm text-muted">
        <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />{{ t('source.loading') }}
      </div>
      <p v-if="error" class="text-sm text-toned">{{ error }}</p>
      <div v-if="source !== null && summary" class="space-y-5">
        <div class="overflow-hidden rounded-lg border border-default text-sm">
          <div v-for="[label, value] in rows" :key="label" class="grid gap-1 border-b border-default px-4 py-3 last:border-b-0 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-4">
            <span class="font-medium text-toned">{{ t(`source.${label}`) }}</span>
            <span :class="label === 'messageId' && value ? 'break-all text-success' : 'break-words text-highlighted'">{{ value || t('source.unavailable') }}</span>
          </div>
          <div v-for="method in (['spf', 'dkim', 'dmarc'] as const)" :key="method" class="grid gap-1 border-b border-default px-4 py-3 last:border-b-0 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-4">
            <span class="font-medium uppercase text-toned">{{ method }}</span>
            <span class="flex min-w-0 items-center gap-1.5 break-all text-highlighted">
              <UIcon v-if="summary[method]?.status === 'PASS'" name="i-lucide-circle-check" class="size-4 shrink-0 text-success" :aria-label="t('source.passed', { method: method.toUpperCase() })" />
              {{ summary[method] ? `${summary[method]!.status}${summary[method]!.detail ? ` ${summary[method]!.detail}` : ''}` : t('source.noResult') }}
            </span>
          </div>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <UButton variant="ghost" size="sm" icon="i-lucide-download" :label="t('source.download')" @click="downloadMessageSource(source, messageId)" />
          <div class="flex items-center gap-2">
            <span v-if="copyError" role="alert" class="text-xs text-error">{{ t('source.couldNotCopy') }}</span>
            <UButton size="sm" icon="i-lucide-copy" :label="copied ? t('source.copied') : t('source.copy')" @click="copy" />
          </div>
        </div>
        <pre class="max-h-[40vh] overflow-auto whitespace-pre rounded-lg border border-default bg-muted p-4 font-mono text-xs leading-relaxed text-toned">{{ source }}</pre>
      </div>
    </template>
  </UModal>
</template>
