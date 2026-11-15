<script setup lang="ts">
// Thirty-day stacked token bars, ported from legacy/src/app/(admin)/ai-usage/usage-chart.tsx.
// UChart (TanStack Charts) gives it an axis, a legend, a tooltip and keyboard focus.
import { getUserTimeZone } from '#lib/time/utils'
import type { AiUsageDaily } from '~/types/admin/system/misc'
import { fillDailyUsage, formatDailyLabel, formatTokenCount } from '~/utils/admin/system/settings'

const props = defineProps<{ daily: AiUsageDaily[], timeZone?: string }>()
const { t } = useLanguage()
const zone = computed(() => props.timeZone ?? getUserTimeZone())
const rows = computed(() => (props.daily.length ? props.daily : fillDailyUsage([], zone.value)).map(day => ({
  day: formatDailyLabel(day.date),
  input: day.inputTokens,
  output: day.outputTokens,
})))
const categories = computed(() => [
  { key: 'input' as const, label: t('aiUsage.legendInput'), color: 'primary' },
  { key: 'output' as const, label: t('aiUsage.legendOutput'), color: 'color-mix(in oklab, var(--ui-primary) 40%, transparent)' },
])
</script>

<template>
  <UCard>
    <h2 class="text-base font-semibold text-highlighted">
      {{ t('aiUsage.byDay') }}
    </h2>
    <p class="mt-1 text-xs text-muted">
      {{ t('aiUsage.chartHint', { zone }) }}
    </p>
    <UChart
      type="bar"
      stacked
      :data="rows"
      index="day"
      :categories="categories"
      :format="formatTokenCount"
      :height="220"
      :aria-label="t('aiUsage.chartLabel')"
      class="mt-5"
    />
  </UCard>
</template>
