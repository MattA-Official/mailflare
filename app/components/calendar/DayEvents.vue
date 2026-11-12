<script setup lang="ts">
// One day column's event blocks with drag-to-move and resize handles.
// Ported from legacy/src/app/(calendar)/calendar/day-events.tsx.
import { normalizeCalendarColor } from '#lib/calendar/colors'
import type { CalendarEvent, EventResizeEdge } from '~/types/calendar'
import { addDays, dateKey, EVENT_COLOR_CLASSES, eventPosition, formatEventRange, PAST_EVENT_COLOR_CLASSES } from '~/utils/calendar/calendar'

const props = defineProps<{
  day: Date
  events: CalendarEvent[]
  currentTime: number
  busy: boolean
  activeEventId: string | null
}>()

const emit = defineEmits<{
  edit: [event: CalendarEvent]
  dragStart: [dragEvent: DragEvent, event: CalendarEvent]
  dragEnd: []
  resizeStart: [pointerEvent: PointerEvent, event: CalendarEvent, day: Date, edge: EventResizeEdge]
  resizeMove: [pointerEvent: PointerEvent]
  resizeEnd: [pointerEvent: PointerEvent]
  resizeCancel: []
}>()

const { t } = useLanguage()

// Positions involve time-zone maths, so they are computed once per events/day change rather than on every drag preview.
const items = computed(() => {
  const nextDay = addDays(props.day, 1)
  return props.events.flatMap((event) => {
    if (!(new Date(event.startsAt) < nextDay && new Date(event.endsAt) > props.day)) return []
    const position = eventPosition(event, props.day)
    if (!position) return []
    const edges = ([
      dateKey(new Date(event.startsAt)) === dateKey(props.day) ? 'start' : null,
      new Date(event.endsAt).getTime() <= nextDay.getTime() ? 'end' : null,
    ] as const).filter((edge): edge is EventResizeEdge => edge !== null)
    return [{
      event,
      position,
      color: normalizeCalendarColor(event.color),
      range: formatEventRange(event),
      edges,
      // Keep the grab zone inside the event so it never steals clicks from neighbours.
      handleHeight: Math.max(4, Math.min(10, position.height / 3)),
    }]
  })
})
</script>

<template>
  <template v-for="item in items" :key="item.event.id">
    <button
      type="button"
      :draggable="!busy"
      :title="`${item.event.title} · ${item.range}`"
      class="absolute inset-x-1 z-10 flex cursor-move flex-col items-start justify-start overflow-hidden rounded-lg pr-2 pl-4 text-left hover:brightness-95"
      :class="[
        item.event.endsAt && new Date(item.event.endsAt).getTime() <= currentTime ? PAST_EVENT_COLOR_CLASSES[item.color] : EVENT_COLOR_CLASSES[item.color],
        item.position.height >= 20 ? 'py-1.5' : 'py-0',
        activeEventId === item.event.id && 'opacity-40',
      ]"
      :style="{ top: `${item.position.top}px`, height: `${item.position.height}px` }"
      @click="emit('edit', item.event)"
      @dragstart="emit('dragStart', $event, item.event)"
      @dragend="emit('dragEnd')"
    >
      <span class="absolute top-1 left-1 block h-[calc(100%-8px)] w-1 rounded-xl bg-current" />
      <span v-if="item.position.height >= 15" class="block w-full truncate text-xs leading-4 font-semibold">{{ item.event.title }}</span>
      <span v-if="item.position.height >= 34" class="block w-full truncate text-[11px] leading-4 opacity-70">{{ item.range }}</span>
    </button>
    <button
      v-for="edge in item.edges"
      :key="edge"
      type="button"
      :draggable="false"
      :aria-label="t(edge === 'start' ? 'calendar.resizeEdge.start' : 'calendar.resizeEdge.end', { title: item.event.title })"
      class="absolute inset-x-1 z-20 cursor-ns-resize touch-none bg-transparent focus-visible:outline-2 focus-visible:outline-primary"
      :style="{ height: `${item.handleHeight}px`, top: `${edge === 'start' ? item.position.top : item.position.top + item.position.height - item.handleHeight}px` }"
      @pointerdown="emit('resizeStart', $event, item.event, day, edge)"
      @pointermove="emit('resizeMove', $event)"
      @pointerup="emit('resizeEnd', $event)"
      @pointercancel="emit('resizeCancel')"
      @click.stop
    />
  </template>
</template>
