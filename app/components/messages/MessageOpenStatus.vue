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
    <UCollapsible v-else class="mb-3 text-xs text-toned">
      <UButton
        variant="link"
        size="xs"
        icon="i-lucide-eye"
        trailing-icon="i-lucide-chevron-down"
        :label="t('message.opens.opened', { count: tracking.openCount, date: tracking.lastOpenedAt ? formatUserDate(tracking.lastOpenedAt, DATE_FORMAT) : '' })"
        class="px-0"
        :ui="{ leadingIcon: 'size-3.5', trailingIcon: 'size-3.5 transition-transform group-data-[state=open]:rotate-180' }"
      />
      <template #content>
        <ul class="mt-2 space-y-1 border-l border-default pl-3">
        <li v-for="event in tracking.opens" :key="event.openedAt" :class="event.automated ? 'text-dimmed' : undefined">
          <time :datetime="event.openedAt">{{ formatUserDate(event.openedAt, DATE_FORMAT) }}</time>
          <span v-if="describeOpenEvent(event, locale)"> · {{ describeOpenEvent(event, locale) }}</span>
          <span v-if="event.automated"> · {{ t('message.opens.automated') }}</span>
        </li>
      </ul>
        <p class="mt-2 text-dimmed">{{ t('message.opens.caveat') }}</p>
      </template>
    </UCollapsible>
  </template>
</template>
