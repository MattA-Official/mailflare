<script setup lang="ts">
// Six-week month grid: up to three events a day with a "more" link that opens the day.
// Ported from legacy/src/app/(calendar)/calendar/month-grid.tsx.
import { normalizeCalendarColor } from '#lib/calendar/colors'
import { formatUserDate } from '#lib/time/utils'
import type { TranslationKey } from '#lib/i18n/types'
import type { CalendarEvent } from '~/types/calendar'
import { addDays, dateKey, EVENT_COLOR_CLASSES, formatEventRange, isPendingInvite, monthGridDates, orderedWeekdays, PAST_EVENT_COLOR_CLASSES, PENDING_EVENT_CLASSES } from '~/utils/calendar/calendar'

const MAX_VISIBLE = 3

const props = defineProps<{
  month: Date
  today: Date
  events: CalendarEvent[]
  currentTime: number
  /** Phones: the grid fits the screen, days show coloured dots, and tapping a day opens it. */
  compact?: boolean
}>()

const emit = defineEmits<{
  selectDay: [day: Date]
  openDay: [day: Date]
  edit: [event: CalendarEvent]
}>()

const { t } = useLanguage()
const WEEKDAYS = orderedWeekdays()

const cells = computed(() => {
  const monthKey = dateKey(props.month).slice(0, 7)
  const todayKey = dateKey(props.today)
  return monthGridDates(props.month).map((day) => {
    const key = dateKey(day)
    const next = addDays(day, 1)
    const list = props.events
      .filter(event => new Date(event.startsAt) < next && new Date(event.endsAt) > day)
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
    return { day, key, list, today: key === todayKey, outside: key.slice(0, 7) !== monthKey, extra: list.length - MAX_VISIBLE }
  })
})

const MAX_DOTS = 4

function dotStyle(event: CalendarEvent) {
  return isPendingInvite(event) ? undefined : { backgroundColor: normalizeCalendarColor(event.color) }
}

function eventClass(event: CalendarEvent) {
  if (isPendingInvite(event)) return PENDING_EVENT_CLASSES
  const color = normalizeCalendarColor(event.color)
  return new Date(event.endsAt).getTime() <= props.currentTime ? PAST_EVENT_COLOR_CLASSES[color] : EVENT_COLOR_CLASSES[color]
}
</script>

<template>
  <div class="flex min-h-full flex-col" :class="!compact && 'min-w-160'">
    <div class="sticky top-0 z-30 grid grid-cols-7 border-b border-default bg-default">
      <span v-for="weekday in WEEKDAYS" :key="weekday" class="py-2 text-xs font-medium text-muted" :class="compact ? 'text-center' : 'px-2'">{{ t(`calendar.weekdayShort.${weekday}` as TranslationKey) }}</span>
    </div>
    <div class="grid flex-1 grid-cols-7 grid-rows-6">
      <div v-for="cell in cells" :key="cell.key" class="relative border-b border-l border-default" :class="compact ? 'min-h-16 p-0.5' : 'min-h-28 p-1'">
        <button
          v-if="compact"
          type="button"
          :aria-label="formatUserDate(cell.day, { dateStyle: 'full' })"
          class="absolute inset-0 z-20 cursor-pointer"
          @click="emit('openDay', cell.day)"
        />
        <button
          v-else
          type="button"
          :aria-label="t('calendar.addEventOn', { date: formatUserDate(cell.day, { dateStyle: 'short' }) })"
          class="absolute inset-0 z-0 cursor-pointer"
          @click="emit('selectDay', cell.day)"
        />
        <component
          :is="compact ? 'span' : 'button'"
          :type="compact ? undefined : 'button'"
          class="relative z-10 mx-auto mb-1 flex size-7 items-center justify-center rounded-full text-sm font-medium"
          :class="cell.today ? 'bg-primary text-inverted' : cell.outside ? 'text-dimmed hover:bg-elevated' : 'text-highlighted hover:bg-elevated'"
          @click="compact || emit('openDay', cell.day)"
        >
          {{ formatUserDate(cell.day, { day: 'numeric' }) }}
        </component>
        <div v-if="compact" aria-hidden="true" class="flex flex-wrap justify-center gap-0.5 px-0.5">
          <span
            v-for="event in cell.list.slice(0, MAX_DOTS)"
            :key="`${event.id}-${event.startsAt}`"
            class="size-1.5 rounded-full"
            :class="isPendingInvite(event) && 'border border-primary'"
            :style="dotStyle(event)"
          />
          <span v-if="cell.list.length > MAX_DOTS" class="text-[9px] leading-1.5 text-muted">+</span>
        </div>
        <div v-else class="relative z-10 space-y-0.5">
          <button
            v-for="event in cell.list.slice(0, MAX_VISIBLE)"
            :key="`${event.id}-${event.startsAt}`"
            type="button"
            :title="`${event.title} · ${formatEventRange(event)}`"
            class="block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium hover:brightness-95"
            :class="eventClass(event)"
            @click="emit('edit', event)"
          >
            {{ event.title }}
          </button>
          <button
            v-if="cell.extra > 0"
            type="button"
            class="block w-full rounded px-1.5 text-left text-[11px] font-medium text-muted hover:bg-elevated"
            @click="emit('openDay', cell.day)"
          >
            {{ t('calendar.moreEvents', { count: cell.extra }) }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
