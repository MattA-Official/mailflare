<script setup lang="ts">
// Delivery history for one webhook. Ported from legacy/src/app/(admin)/webhooks/deliveries.tsx.
import type { TableColumn } from '@nuxt/ui'
import type { WebhookDelivery } from '~/types/admin/email/webhooks'
import { DELIVERY_STATUS_COLORS, DELIVERY_STATUS_LABELS, fetchDeliveries, formatDuration, formatTimestamp, isRetryable, retryDelivery } from '~/utils/admin/email/webhooks'
import { errorMessage } from '~/utils/admin/email/domains'

const props = defineProps<{ webhookId: string }>()
const emit = defineEmits<{ changed: [] }>()
const { t } = useLanguage()
const toast = useToast()
const { data: deliveries, status, error: loadError, refresh } = useAsyncData(() => `webhook-deliveries-${props.webhookId}`, () => fetchDeliveries(props.webhookId))

// Retries land asynchronously from the queue, so keep the table fresh while it is open.
const timer = setInterval(() => void refresh(), 15_000)
onBeforeUnmount(() => clearInterval(timer))

const retrying = ref(false)
const columns = computed<TableColumn<WebhookDelivery>[]>(() => [
  { id: 'event', header: t('webhooks.col.event') },
  { id: 'status', header: t('webhooks.col.status') },
  { id: 'attempts', header: t('webhooks.col.attempts') },
  { id: 'response', header: t('webhooks.col.response') },
  { id: 'lastAttempt', header: t('webhooks.col.lastAttempt'), cell: ({ row }) => formatTimestamp(row.original.lastAttemptAt), meta: { class: { td: 'text-toned' } } },
  { id: 'nextRetry', header: t('webhooks.col.nextRetry'), cell: ({ row }) => formatTimestamp(row.original.nextRetryAt), meta: { class: { td: 'text-toned' } } },
  { id: 'retry', header: '' },
])
async function retry(deliveryId: string) {
  retrying.value = true
  try {
    await retryDelivery(props.webhookId, deliveryId)
  } catch (error) {
    toast.add({ title: errorMessage(error, t('domains.requestFailed')), color: 'error' })
  } finally {
    retrying.value = false
  }
  await refresh()
  emit('changed')
}
</script>

<template>
  <p v-if="loadError && !deliveries" role="alert" class="text-sm text-error">
    {{ errorMessage(loadError, t('domains.requestFailed')) }}
  </p>
  <p v-else-if="status === 'pending' && !deliveries" class="text-sm text-muted">
    {{ t('webhooks.loadingDeliveries') }}
  </p>
  <p v-else-if="!deliveries?.length" class="text-sm text-muted">
    {{ t('webhooks.noDeliveries') }}
  </p>
  <UTable
    v-else
    :data="deliveries"
    :columns="columns"
    :caption="t('webhooks.stat.deliveries')"
    :ui="{ base: 'w-full min-w-[820px]', th: 'py-2', td: 'py-2 align-top text-default' }"
  >
    <template #event-cell="{ row }">
      <span class="block">{{ row.original.eventType }}</span>
      <span class="block text-xs text-muted">{{ formatTimestamp(row.original.createdAt) }}</span>
    </template>
    <template #status-cell="{ row }">
      <UBadge :color="DELIVERY_STATUS_COLORS[row.original.status] ?? 'neutral'" variant="soft" :label="DELIVERY_STATUS_LABELS[row.original.status] ? t(DELIVERY_STATUS_LABELS[row.original.status]) : row.original.status" />
    </template>
    <!-- Manual retries can push attempts past the configured max, so never show "3 / 2". -->
    <template #attempts-cell="{ row }">
      {{ row.original.attempts }} / {{ Math.max(row.original.maxAttempts, row.original.attempts) }}
    </template>
    <template #response-cell="{ row }">
      <span class="block">
        {{ row.original.responseStatus ?? '—' }}
        <span v-if="row.original.durationMs !== null" class="ml-1 text-xs text-muted">· {{ formatDuration(row.original.durationMs) }}</span>
      </span>
      <span v-if="row.original.error" class="mt-1 block max-w-xs truncate text-xs text-error" :title="row.original.error">{{ row.original.error }}</span>
    </template>
    <template #retry-cell="{ row }">
      <UButton v-if="isRetryable(row.original)" color="neutral" variant="outline" size="sm" icon="i-lucide-rotate-cw" :disabled="retrying" :label="t('webhooks.retry')" @click="retry(row.original.id)" />
    </template>
  </UTable>
</template>
