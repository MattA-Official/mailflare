<script setup lang="ts">
// Month heading that opens a date picker. The calendar follows the user's time zone, so the
// selected day is converted through it rather than through the browser's zone, and weeks start on
// Sunday like the calendar grid beside it.
import { parseDate, type DateValue } from '@internationalized/date'
import { formatUserDate, parseUserDateTimeLocal } from '#lib/time/utils'
import { dateKey } from '~/utils/calendar/calendar'

const model = defineModel<Date>({ required: true })
const { t } = useLanguage()
const open = ref(false)
const selected = computed(() => parseDate(dateKey(model.value)))

function choose(day: DateValue) {
  const picked = parseUserDateTimeLocal(`${day.toString().slice(0, 10)}T00:00`)
  if (picked) model.value = picked
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
      <UCalendar
        :model-value="selected"
        :week-starts-on="0"
        :aria-label="t('calendar.chooseDate')"
        class="p-2"
        @update:model-value="value => value && choose(value as DateValue)"
      />
    </template>
  </UPopover>
</template>
