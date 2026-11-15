<script setup lang="ts">
// Six-week month grid: up to three events a day with a "more" link that opens the day. Events can be
// dragged to another day, and dragging across empty days selects them for a new event.
// Ported from legacy/src/app/(calendar)/calendar/month-grid.tsx; the dragging is the fork's.
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
  /** A save is in flight: nothing can be dragged. */
  busy?: boolean
}>()

const emit = defineEmits<{
  selectDay: [day: Date]
  openDay: [day: Date]
  edit: [event: CalendarEvent]
  /** An event dropped on another day, `days` later (or earlier, when negative). */
  move: [event: CalendarEvent, days: number]
  /** Empty days dragged across, first and last inclusive. */
  selectDays: [first: Date, last: Date]
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

function daysBetween(from: Date, to: Date): number {
  return Math.round((Date.parse(dateKey(to)) - Date.parse(dateKey(from))) / 86_400_000)
}

// Moving an event: HTML drag and drop, as in the week view.
const dragged = shallowRef<{ event: CalendarEvent, from: Date } | null>(null)
const dropKey = ref<string | null>(null)

function onEventDragStart(dragEvent: DragEvent, event: CalendarEvent, from: Date) {
  dragEvent.dataTransfer?.setData('text/plain', event.id)
  if (dragEvent.dataTransfer) dragEvent.dataTransfer.effectAllowed = 'move'
  dragged.value = { event, from }
}

function onCellDragOver(dragEvent: DragEvent, key: string) {
  if (!dragged.value) return
  dragEvent.preventDefault()
  if (dragEvent.dataTransfer) dragEvent.dataTransfer.dropEffect = 'move'
  dropKey.value = key
}

function onCellDrop(dragEvent: DragEvent, day: Date) {
  const source = dragged.value
  dragged.value = null
  dropKey.value = null
  if (!source) return
  dragEvent.preventDefault()
  const days = daysBetween(source.from, day)
  if (days !== 0) emit('move', source.event, days)
}

function onEventDragEnd() {
  dragged.value = null
  dropKey.value = null
}

// Selecting days: press on an empty part of a day and drag across others. A press without a drag
// is a click, which keeps creating an event on that day.
const selecting = shallowRef<{ anchor: Date, current: Date, pointerId: number } | null>(null)
let suppressClick = false

const selectedRange = computed(() => {
  const value = selecting.value
  if (!value) return null
  const [first, last] = [dateKey(value.anchor), dateKey(value.current)].sort()
  return { first: first!, last: last! }
})

function dayUnderPointer(pointerEvent: PointerEvent): Date | null {
  const cell = document.elementFromPoint(pointerEvent.clientX, pointerEvent.clientY)?.closest<HTMLElement>('[data-day]')
  const key = cell?.dataset.day
  return key ? cells.value.find(item => item.key === key)?.day ?? null : null
}

function onCellPointerDown(pointerEvent: PointerEvent, day: Date) {
  if (props.compact || props.busy || pointerEvent.button !== 0 || pointerEvent.pointerType === 'touch') return
  const target = pointerEvent.currentTarget as HTMLElement
  target.setPointerCapture(pointerEvent.pointerId)
  selecting.value = { anchor: day, current: day, pointerId: pointerEvent.pointerId }
}

function onCellPointerMove(pointerEvent: PointerEvent) {
  const value = selecting.value
  if (!value || value.pointerId !== pointerEvent.pointerId) return
  const day = dayUnderPointer(pointerEvent)
  if (day && dateKey(day) !== dateKey(value.current)) selecting.value = { ...value, current: day }
}

function onCellPointerUp(pointerEvent: PointerEvent) {
  const value = selecting.value
  if (!value || value.pointerId !== pointerEvent.pointerId) return
  selecting.value = null
  if (dateKey(value.anchor) === dateKey(value.current)) return
  suppressClick = true
  const [first, last] = value.anchor < value.current ? [value.anchor, value.current] : [value.current, value.anchor]
  emit('selectDays', first, last)
}

function onCellClick(day: Date) {
  if (suppressClick) {
    suppressClick = false
    return
  }
  emit('selectDay', day)
}

function inSelection(key: string): boolean {
  const range = selectedRange.value
  return !!range && key >= range.first && key <= range.last
}

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
      <div
        v-for="cell in cells"
        :key="cell.key"
        :data-day="cell.key"
        class="relative border-b border-l border-default"
        :class="[compact ? 'min-h-16 p-0.5' : 'min-h-28 p-1', (dropKey === cell.key || inSelection(cell.key)) && 'bg-primary/10 ring-2 ring-primary ring-inset']"
        @dragover="onCellDragOver($event, cell.key)"
        @drop="onCellDrop($event, cell.day)"
      >
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
          class="absolute inset-0 z-0 cursor-pointer select-none"
          @pointerdown="onCellPointerDown($event, cell.day)"
          @pointermove="onCellPointerMove"
          @pointerup="onCellPointerUp"
          @pointercancel="selecting = null"
          @click="onCellClick(cell.day)"
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
            :draggable="!busy && !isPendingInvite(event)"
            class="block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium hover:brightness-95"
            :class="[eventClass(event), dragged?.event.id === event.id && 'opacity-40']"
            @click="emit('edit', event)"
            @dragstart="onEventDragStart($event, event, cell.day)"
            @dragend="onEventDragEnd"
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
