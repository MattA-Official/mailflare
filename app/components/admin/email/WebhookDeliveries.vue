<script setup lang="ts">
// Delivery history for one webhook. Ported from legacy/src/app/(admin)/webhooks/deliveries.tsx.
import { DELIVERY_STATUS_COLORS, DELIVERY_STATUS_LABELS, fetchDeliveries, formatDuration, formatTimestamp, isRetryable, retryDelivery } from '~/utils/admin/email/webhooks'
import { errorMessage } from '~/utils/admin/email/domains'

const props = defineProps<{ webhookId: string }>()
const emit = defineEmits<{ changed: [] }>()
const { t } = useLanguage()
const toast = useToast()
const { data: deliveries, status, refresh } = useAsyncData(`webhook-deliveries-${props.webhookId}`, () => fetchDeliveries(props.webhookId))

// Retries land asynchronously from the queue, so keep the table fresh while it is open.
const timer = setInterval(() => void refresh(), 15_000)
onBeforeUnmount(() => clearInterval(timer))

const retrying = ref(false)
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
  <p v-if="status === 'pending' && !deliveries" class="text-sm text-muted">
    {{ t('webhooks.loadingDeliveries') }}
  </p>
  <p v-else-if="!deliveries?.length" class="text-sm text-muted">
    {{ t('webhooks.noDeliveries') }}
  </p>
  <div v-else role="region" tabindex="0" :aria-label="t('webhooks.stat.deliveries')" class="overflow-x-auto rounded-lg border border-default">
    <table class="w-full min-w-[820px] text-left text-sm">
      <thead class="bg-elevated/60 text-xs uppercase tracking-wide text-muted">
        <tr>
          <th scope="col" class="px-3 py-2 font-medium">
            {{ t('webhooks.col.event') }}
          </th>
          <th scope="col" class="px-3 py-2 font-medium">
            {{ t('webhooks.col.status') }}
          </th>
          <th scope="col" class="px-3 py-2 font-medium">
            {{ t('webhooks.col.attempts') }}
          </th>
          <th scope="col" class="px-3 py-2 font-medium">
            {{ t('webhooks.col.response') }}
          </th>
          <th scope="col" class="px-3 py-2 font-medium">
            {{ t('webhooks.col.lastAttempt') }}
          </th>
          <th scope="col" class="px-3 py-2 font-medium">
            {{ t('webhooks.col.nextRetry') }}
          </th>
          <th scope="col" class="px-3 py-2 font-medium" />
        </tr>
      </thead>
      <tbody>
        <tr v-for="delivery in deliveries" :key="delivery.id" class="border-t border-default align-top">
          <td class="px-3 py-2">
            <span class="block">{{ delivery.eventType }}</span>
            <span class="block text-xs text-muted">{{ formatTimestamp(delivery.createdAt) }}</span>
          </td>
          <td class="px-3 py-2">
            <UBadge :color="DELIVERY_STATUS_COLORS[delivery.status] ?? 'neutral'" variant="soft" :label="DELIVERY_STATUS_LABELS[delivery.status] ? t(DELIVERY_STATUS_LABELS[delivery.status]) : delivery.status" />
          </td>
          <!-- Manual retries can push attempts past the configured max, so never show "3 / 2". -->
          <td class="whitespace-nowrap px-3 py-2">
            {{ delivery.attempts }} / {{ Math.max(delivery.maxAttempts, delivery.attempts) }}
          </td>
          <td class="px-3 py-2">
            <span class="block whitespace-nowrap">
              {{ delivery.responseStatus ?? '—' }}
              <span v-if="delivery.durationMs !== null" class="ml-1 text-xs text-muted">· {{ formatDuration(delivery.durationMs) }}</span>
            </span>
            <span v-if="delivery.error" class="mt-1 block max-w-xs truncate text-xs text-error" :title="delivery.error">{{ delivery.error }}</span>
          </td>
          <td class="whitespace-nowrap px-3 py-2 text-toned">
            {{ formatTimestamp(delivery.lastAttemptAt) }}
          </td>
          <td class="whitespace-nowrap px-3 py-2 text-toned">
            {{ formatTimestamp(delivery.nextRetryAt) }}
          </td>
          <td class="px-3 py-2">
            <UButton v-if="isRetryable(delivery)" color="neutral" variant="outline" size="sm" icon="i-lucide-rotate-cw" :disabled="retrying" :label="t('webhooks.retry')" @click="retry(delivery.id)" />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
