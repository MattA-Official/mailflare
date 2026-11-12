<script setup lang="ts">
// Month heading that opens a date picker. The grid follows the user's time zone like the rest of
// the calendar, which is why it is not UCalendar (that works in the browser's zone).
import { formatUserDate } from '#lib/time/utils'
import type { TranslationKey } from '#lib/i18n/types'
import { addMonths, dateKey, monthGridDates, startOfDay, startOfMonth } from '~/utils/calendar/calendar'

const model = defineModel<Date>({ required: true })
const { t } = useLanguage()
const open = ref(false)
const pickerMonth = ref(startOfMonth(model.value))
const todayKey = computed(() => dateKey(startOfDay(new Date())))
const dates = computed(() => monthGridDates(pickerMonth.value))

watch(open, (value) => {
  if (value) pickerMonth.value = startOfMonth(model.value)
})

function choose(day: Date) {
  model.value = day
  open.value = false
}
</script>

<template>
  <UPopover v-model:open="open" :content="{ align: 'start' }">
    <UButton
      color="neutral"
      variant="ghost"
      trailing-icon="i-lucide-chevron-down"
      class="text-lg font-semibold whitespace-nowrap max-md:text-base"
      :label="formatUserDate(model, { month: 'long', year: 'numeric' })"
      aria-haspopup="dialog"
    />
    <template #content>
      <div role="dialog" :aria-label="t('calendar.chooseDate')" class="w-80 max-w-[calc(100vw-24px)] p-4">
        <div class="mb-3 flex items-center justify-between gap-3">
          <h2 class="text-base font-semibold text-highlighted">
            {{ formatUserDate(pickerMonth, { month: 'long', year: 'numeric' }) }}
          </h2>
          <div class="flex items-center gap-1">
            <UButton icon="i-lucide-chevron-left" color="neutral" variant="ghost" :aria-label="t('calendar.previousMonth')" @click="pickerMonth = addMonths(pickerMonth, -1)" />
            <UButton icon="i-lucide-chevron-right" color="neutral" variant="ghost" :aria-label="t('calendar.nextMonth')" @click="pickerMonth = addMonths(pickerMonth, 1)" />
          </div>
        </div>
        <div class="grid grid-cols-7">
          <span
            v-for="weekday in 7"
            :key="weekday"
            :aria-label="t(`weekday.${weekday - 1}` as TranslationKey)"
            class="flex h-8 items-center justify-center text-xs font-medium text-muted"
          >{{ t(`weekday.${weekday - 1}` as TranslationKey).charAt(0).toUpperCase() }}</span>
          <button
            v-for="day in dates"
            :key="dateKey(day)"
            type="button"
            :aria-label="formatUserDate(day, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })"
            :aria-pressed="dateKey(day) === dateKey(model)"
            class="mx-auto my-0.5 flex size-9 items-center justify-center rounded-full text-sm font-medium hover:bg-elevated"
            :class="dateKey(day) === dateKey(model)
              ? 'bg-primary text-inverted hover:bg-primary'
              : dateKey(day) === todayKey
                ? 'bg-accented text-highlighted'
                : dateKey(day).slice(0, 7) !== dateKey(pickerMonth).slice(0, 7) ? 'text-muted' : 'text-highlighted'"
            @click="choose(day)"
          >
            {{ formatUserDate(day, { day: 'numeric' }) }}
          </button>
        </div>
      </div>
    </template>
  </UPopover>
</template>
