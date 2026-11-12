<script setup lang="ts">
// Read-receipt status of a sent message; renders nothing when it was sent without a pixel.
// Ported from legacy/src/components/messages/message-open-status.tsx.
import { formatUserDate } from '#lib/time/utils'
import type { MessageTrackingSummary } from '#lib/tracking/types'
import { describeOpenEvent, fetchMessageTracking } from '~/utils/messages/open-status-utils'

const props = defineProps<{ messageId: string }>()
const { t, locale } = useLanguage()
const tracking = shallowRef<MessageTrackingSummary | null>(null)
const DATE_FORMAT: Intl.DateTimeFormatOptions = { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }

watch(() => props.messageId, (id, _previous, onCleanup) => {
  let cancelled = false
  onCleanup(() => {
    cancelled = true
  })
  tracking.value = null
  void fetchMessageTracking(id).then((result) => {
    if (!cancelled) tracking.value = result
  }).catch(() => undefined)
}, { immediate: true })
</script>

<template>
  <template v-if="tracking">
    <p v-if="tracking.openCount === 0" class="mb-3 flex items-center gap-1.5 text-xs text-muted">
      <UIcon name="i-lucide-eye-off" class="size-3.5" aria-hidden="true" />
      {{ tracking.onlyAutomated ? t('message.opens.onlyAutomated') : t('message.opens.notYet') }}
    </p>
    <details v-else class="mb-3 text-xs text-toned">
      <summary class="flex cursor-pointer list-none items-center gap-1.5 text-primary [&::-webkit-details-marker]:hidden">
        <UIcon name="i-lucide-eye" class="size-3.5" aria-hidden="true" />
        {{ t('message.opens.opened', { count: tracking.openCount, date: tracking.lastOpenedAt ? formatUserDate(tracking.lastOpenedAt, DATE_FORMAT) : '' }) }}
      </summary>
      <ul class="mt-2 space-y-1 border-l border-default pl-3">
        <li v-for="event in tracking.opens" :key="event.openedAt" :class="event.automated ? 'text-dimmed' : undefined">
          <time :datetime="event.openedAt">{{ formatUserDate(event.openedAt, DATE_FORMAT) }}</time>
          <span v-if="describeOpenEvent(event, locale)"> · {{ describeOpenEvent(event, locale) }}</span>
          <span v-if="event.automated"> · {{ t('message.opens.automated') }}</span>
        </li>
      </ul>
      <p class="mt-2 text-dimmed">{{ t('message.opens.caveat') }}</p>
    </details>
  </template>
</template>
