<script setup lang="ts">
// Thirty-day stacked token bars, ported from legacy/src/app/(admin)/ai-usage/usage-chart.tsx.
import { getUserTimeZone } from '#lib/time/utils'
import type { AiUsageDaily } from '~/types/admin/system/misc'
import { fillDailyUsage, formatDailyLabel, formatTokenCount } from '~/utils/admin/system/settings'

const props = defineProps<{ daily: AiUsageDaily[], timeZone?: string }>()
const { t } = useLanguage()
const zone = computed(() => props.timeZone ?? getUserTimeZone())
const days = computed(() => props.daily.length ? props.daily : fillDailyUsage([], zone.value))
const maxTokens = computed(() => Math.max(0, ...days.value.map(day => day.inputTokens + day.outputTokens)))
</script>

<template>
  <UCard>
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-base font-semibold text-highlighted">
          {{ t('aiUsage.byDay') }}
        </h2>
        <p class="mt-1 text-xs text-muted">
          {{ t('aiUsage.chartHint', { zone }) }}
        </p>
      </div>
      <div class="flex items-center gap-4 text-xs text-toned">
        <span class="flex items-center gap-1.5"><span class="size-2.5 rounded-sm bg-primary" /> {{ t('aiUsage.legendInput') }}</span>
        <span class="flex items-center gap-1.5"><span class="size-2.5 rounded-sm bg-primary/40" /> {{ t('aiUsage.legendOutput') }}</span>
      </div>
    </div>
    <div class="mt-5 flex gap-3" role="img" :aria-label="t('aiUsage.chartLabel')">
      <div class="flex h-48 flex-col justify-between pb-5 text-right text-[10px] text-muted">
        <span>{{ formatTokenCount(maxTokens) }}</span><span>0</span>
      </div>
      <div class="flex min-w-0 flex-1 items-end gap-1 border-b border-default">
        <div
          v-for="(day, index) in days"
          :key="day.date"
          class="flex h-48 min-w-0 flex-1 flex-col items-center"
          :title="t('aiUsage.barTitle', { day: formatDailyLabel(day.date), tokens: formatTokenCount(day.inputTokens + day.outputTokens), requests: formatTokenCount(day.requests) })"
        >
          <div class="flex h-[172px] w-full items-end justify-center">
            <div class="relative w-full max-w-5 overflow-hidden rounded-t-sm" :style="{ height: `${day.inputTokens + day.outputTokens ? Math.max(2, (day.inputTokens + day.outputTokens) / maxTokens * 100) : 0}%` }">
              <div class="absolute inset-x-0 bottom-0 bg-primary" :style="{ height: `${day.inputTokens + day.outputTokens ? day.inputTokens / (day.inputTokens + day.outputTokens) * 100 : 0}%` }" />
              <div class="absolute inset-x-0 top-0 bg-primary/40" :style="{ height: `${day.inputTokens + day.outputTokens ? day.outputTokens / (day.inputTokens + day.outputTokens) * 100 : 0}%` }" />
            </div>
          </div>
          <span class="h-5 whitespace-nowrap pt-1 text-[9px] text-muted">{{ index % 5 === 0 || index === days.length - 1 ? formatDailyLabel(day.date) : '' }}</span>
        </div>
      </div>
    </div>
  </UCard>
</template>
