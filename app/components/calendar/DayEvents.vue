<script setup lang="ts">
// One day column's event blocks with drag-to-move and resize handles.
// Ported from legacy/src/app/(calendar)/calendar/day-events.tsx.
import { normalizeCalendarColor } from '#lib/calendar/colors'
import type { CalendarEvent, EventResizeEdge } from '~/types/calendar'
import { addDays, dateKey, EVENT_COLOR_CLASSES, eventPosition, formatEventRange, formatEventTime, isPendingInvite, layoutOverlappingEvents, PAST_EVENT_COLOR_CLASSES, PENDING_EVENT_CLASSES } from '~/utils/calendar/calendar'

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
  const placed = props.events.flatMap((event) => {
    if (!(new Date(event.startsAt) < nextDay && new Date(event.endsAt) > props.day)) return []
    const position = eventPosition(event, props.day)
    if (!position) return []
    // A pending invitation is answered, not moved: no dragging and no resize handles.
    const pending = isPendingInvite(event)
    const edges = pending ? [] : ([
      dateKey(new Date(event.startsAt)) === dateKey(props.day) ? 'start' : null,
      new Date(event.endsAt).getTime() <= nextDay.getTime() ? 'end' : null,
    ] as const).filter((edge): edge is EventResizeEdge => edge !== null)
    return [{
      event,
      position,
      color: normalizeCalendarColor(event.color),
      range: formatEventRange(event),
      start: formatEventTime(new Date(event.startsAt)),
      edges,
      pending,
      // Keep the grab zone inside the event so it never steals clicks from neighbours.
      handleHeight: Math.max(4, Math.min(10, position.height / 3)),
    }]
  })
  // Overlapping events cascade as in Google Calendar: each later column starts further right and runs
  // to the edge, drawn above the ones before it, so every event keeps its start and title in view.
  const columns = layoutOverlappingEvents(placed.map(item => item.position))
  return placed.map((item, index) => {
    const { column, columns: count } = columns[index]!
    // Steps of 1/(n+1) leave the later columns wider than an equal split would.
    const offset = column / (count + 1)
    return {
      ...item,
      horizontal: {
        left: `calc(4px + (100% - 8px) * ${offset})`,
        width: `calc((100% - 8px) * ${1 - offset})`,
        zIndex: 10 + Math.min(column, 4),
        boxShadow: column > 0 ? '0 0 0 1px var(--ui-bg)' : undefined,
      },
    }
  })
})
</script>

<template>
  <template v-for="item in items" :key="item.event.id">
    <button
      type="button"
      :draggable="!busy && !item.pending"
      :title="`${item.event.title} · ${item.range}`"
      class="absolute flex cursor-move flex-col items-start justify-start overflow-hidden rounded-lg pr-2 pl-4 text-left hover:brightness-95"
      :class="[
        item.pending ? PENDING_EVENT_CLASSES : item.event.endsAt && new Date(item.event.endsAt).getTime() <= currentTime ? PAST_EVENT_COLOR_CLASSES[item.color] : EVENT_COLOR_CLASSES[item.color],
        item.position.height >= 36 ? 'py-1.5' : item.position.height >= 18 ? 'py-1' : 'py-0',
        activeEventId === item.event.id && 'opacity-40',
      ]"
      :style="{ ...item.horizontal, top: `${item.position.top}px`, height: `${item.position.height}px` }"
      @click="emit('edit', item.event)"
      @dragstart="emit('dragStart', $event, item.event)"
      @dragend="emit('dragEnd')"
    >
      <span class="absolute top-1 left-1 block h-[calc(100%-8px)] w-1 rounded-xl bg-current" />
      <!-- Short events fit title and start time on one line; longer ones show the range underneath. -->
      <span v-if="item.position.height < 36" class="flex w-full min-w-0 items-baseline gap-1.5 text-[11px] leading-3 whitespace-nowrap">
        <span class="truncate font-semibold">{{ item.event.title }}</span>
        <span class="shrink-0 opacity-70">{{ item.start }}</span>
      </span>
      <template v-else>
        <span class="block w-full truncate text-xs leading-4 font-semibold">{{ item.event.title }}</span>
        <span class="block w-full truncate text-[11px] leading-4 opacity-70">{{ item.range }}</span>
      </template>
    </button>
    <button
      v-for="edge in item.edges"
      :key="edge"
      type="button"
      :draggable="false"
      :aria-label="t(edge === 'start' ? 'calendar.resizeEdge.start' : 'calendar.resizeEdge.end', { title: item.event.title })"
      class="absolute cursor-ns-resize touch-none bg-transparent focus-visible:outline-2 focus-visible:outline-primary"
      :style="{ left: item.horizontal.left, width: item.horizontal.width, zIndex: item.horizontal.zIndex + 5, height: `${item.handleHeight}px`, top: `${edge === 'start' ? item.position.top : item.position.top + item.position.height - item.handleHeight}px` }"
      @pointerdown="emit('resizeStart', $event, item.event, day, edge)"
      @pointermove="emit('resizeMove', $event)"
      @pointerup="emit('resizeEnd', $event)"
      @pointercancel="emit('resizeCancel')"
      @click.stop
    />
  </template>
</template>
