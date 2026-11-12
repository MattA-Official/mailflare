<script setup lang="ts">
// Week and day calendar with drag-to-move, resize and an event editor.
// Ported from legacy/src/app/(calendar)/calendar/page.tsx and the (calendar) layout.
import { formatUserDate, getUserTimeZone } from '#lib/time/utils'
import { normalizeCalendarColor } from '#lib/calendar/colors'
import { parseCalendarRepeatDays } from '#lib/calendar/recurrence'
import type { CalendarEvent, CalendarMailbox, CalendarView, EventDragPreview, EventResizeEdge, EventResizeSession } from '~/types/calendar'
import {
  addDays, calendarAnchorDay, CALENDAR_END_HOUR, CALENDAR_HOUR_HEIGHT, CALENDAR_START_HOUR,
  currentTimePosition, dateKey, dropStartForPosition, EVENT_COLOR_CLASSES, eventPosition, expandCalendarEvents,
  formatEventRange, formatHour, PAST_EVENT_COLOR_CLASSES, rescheduleCalendarOccurrence, resizeEventTimes, startOfDay, startOfWeek,
} from '~/utils/calendar/calendar'
import { loadSelectedMailbox } from '~/utils/calendar/mailbox'

definePageMeta({ layout: 'dashboard', nav: 'calendar', auth: { feature: 'calendar' } })

const { t } = useLanguage()
const toast = useToast()
const route = useRoute()
const router = useRouter()
useHead({ title: () => t('account.calendar') })

const events = shallowRef<CalendarEvent[]>([])
const loading = ref(true)
const eventsVersion = ref(0)
const currentTime = ref(Date.now())
const visibleDate = ref(new Date())
const view = ref<CalendarView>('week')
const draggedEvent = shallowRef<CalendarEvent | null>(null)
const resizingEvent = shallowRef<CalendarEvent | null>(null)
const dragPreview = shallowRef<EventDragPreview | null>(null)
const pendingId = ref<string | null>(null)
const mailbox = shallowRef<CalendarMailbox | null>(null)
const editorOpen = ref(false)
const editor = useTemplateRef<{ openNew: (day: Date, startAt?: Date) => void, openEdit: (event: CalendarEvent) => void }>('editor')
let dragOffsetPixels = 0
let resizeSession: EventResizeSession | null = null

const now = computed(() => new Date(currentTime.value))
const today = computed(() => startOfDay(now.value))
const weekStart = computed(() => startOfWeek(visibleDate.value))
const days = computed(() => view.value === 'day' ? [startOfDay(visibleDate.value)] : Array.from({ length: 7 }, (_, index) => addDays(weekStart.value, index)))
const gridColumns = computed(() => `64px repeat(${days.value.length}, minmax(0, 1fr))`)
const hourCount = CALENDAR_END_HOUR - CALENDAR_START_HOUR
const busy = computed(() => pendingId.value !== null)
const activeEventId = computed(() => draggedEvent.value?.id ?? resizingEvent.value?.id ?? null)
const viewItems = computed(() => [{ label: t('calendar.week'), value: 'week' }, { label: t('calendar.day'), value: 'day' }])
const mobileMenu = computed(() => [
  [{ label: t('calendar.today'), onSelect: () => { visibleDate.value = new Date() } }],
  (['week', 'day'] as const).map(option => ({
    label: option === 'week' ? t('calendar.week') : t('calendar.day'),
    type: 'checkbox' as const,
    checked: view.value === option,
    onSelect: () => { view.value = option },
  })),
])

const previewEvent = computed(() => {
  const source = draggedEvent.value ?? resizingEvent.value
  const preview = dragPreview.value
  return preview && source ? { ...source, startsAt: preview.startsAt.toISOString(), endsAt: preview.endsAt.toISOString() } : null
})
const previewPosition = computed(() => dragPreview.value && previewEvent.value ? eventPosition(previewEvent.value, dragPreview.value.day) : null)

let clock: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  clock = setInterval(() => { currentTime.value = Date.now() }, 60_000)
  loadSelectedMailbox().then((value) => { mailbox.value = value }).catch(() => {})
})
onBeforeUnmount(() => clearInterval(clock))

const range = computed(() => ({
  start: new Date(Math.min(today.value.getTime(), weekStart.value.getTime(), startOfDay(visibleDate.value).getTime())),
  end: new Date(Math.max(addDays(today.value, 90).getTime(), addDays(weekStart.value, 7).getTime(), addDays(visibleDate.value, 1).getTime())),
}))

let loadGeneration = 0
watch([() => range.value.start.getTime(), () => range.value.end.getTime(), eventsVersion], async () => {
  const generation = ++loadGeneration
  const { start, end } = range.value
  loading.value = true
  try {
    const data = await api<{ events?: CalendarEvent[] }>(`/api/calendar/events?start=${start.toISOString()}&end=${end.toISOString()}`)
    if (generation === loadGeneration) events.value = expandCalendarEvents(data.events ?? [], start, end)
  } catch {
    if (generation === loadGeneration) toast.add({ title: t('calendar.loadFailed'), color: 'error' })
  } finally {
    if (generation === loadGeneration) loading.value = false
  }
}, { immediate: true })

// /calendar?event=<id> (from the upcoming list elsewhere) opens that event once it has loaded.
watch([events, () => route.query.event], () => {
  const id = typeof route.query.event === 'string' ? route.query.event : null
  if (!id) return
  const event = events.value.find(item => item.id === id)
  if (!event) return
  editEvent(event)
  void router.replace({ query: {} })
}, { immediate: true })

function openNewEvent(day = visibleDate.value, startAt?: Date) {
  editor.value?.openNew(day, startAt)
}

function editEvent(event: CalendarEvent) {
  if (editor.value) editor.value.openEdit(event)
  else nextTick(() => editor.value?.openEdit(event))
}

function onSaved() {
  eventsVersion.value += 1
}

function clearDrag() {
  draggedEvent.value = null
  resizingEvent.value = null
  dragPreview.value = null
}

function senderAddress() {
  const value = mailbox.value
  return value?.senderAddresses?.[0] ?? (value ? `${value.localPart}@${value.hostname}` : '')
}

async function saveEventTimes(event: CalendarEvent, startsAt: Date, endsAt: Date) {
  if (startsAt.getTime() === new Date(event.startsAt).getTime() && endsAt.getTime() === new Date(event.endsAt).getTime()) {
    clearDrag()
    return
  }
  pendingId.value = event.id
  // Non-recurring events move in place right away; the refetch confirms.
  const previousEvents = event.repeat === 'none' ? events.value : null
  if (previousEvents) {
    events.value = events.value.map(item => item.id === event.id ? { ...item, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() } : item)
  }
  let saved = false
  try {
    const movingToPast = event.repeat !== 'none' && startsAt.getTime() < Date.now()
    const effectiveFrom = event.repeat !== 'none' && !movingToPast ? new Date() : null
    let savedStart = startsAt
    let savedEnd = endsAt
    if (effectiveFrom) {
      const next = rescheduleCalendarOccurrence(event, startsAt, endsAt, effectiveFrom)
      if (!next) {
        toast.add({ title: t('calendar.noFuture'), color: 'error' })
        return
      }
      savedStart = next.startsAt
      savedEnd = next.endsAt
    }
    let attendees: string[] = []
    try { attendees = JSON.parse(event.attendees || '[]') as string[] } catch { /* Keep none. */ }
    await api(`/api/calendar/events/${event.id}`, {
      method: 'PATCH',
      body: {
        title: event.title,
        description: event.description,
        location: event.location,
        attendees,
        color: event.color,
        repeat: event.repeat,
        repeatDays: parseCalendarRepeatDays(event.repeatDays),
        timeZone: getUserTimeZone(),
        repeatAnchorDay: event.repeat === 'monthly' && dateKey(startsAt) === dateKey(new Date(event.startsAt))
          ? event.repeatAnchorDay ?? calendarAnchorDay(event, new Date(event.seriesStartsAt ?? event.startsAt))
          : calendarAnchorDay(event, startsAt),
        effectiveFrom: effectiveFrom?.toISOString(),
        moveOccurrenceToPast: movingToPast,
        startsAt: savedStart.toISOString(),
        endsAt: savedEnd.toISOString(),
        from: senderAddress(),
      },
    })
    saved = true
    eventsVersion.value += 1
  } catch {
    toast.add({ title: t('calendar.updateTimeFailed'), color: 'error' })
  } finally {
    if (previousEvents && !saved) events.value = previousEvents
    clearDrag()
    pendingId.value = null
  }
}

function onDragStart(dragEvent: DragEvent, event: CalendarEvent) {
  const target = dragEvent.currentTarget as HTMLElement
  dragOffsetPixels = dragEvent.clientY - target.getBoundingClientRect().top
  dragEvent.dataTransfer?.setData('text/plain', event.id)
  if (dragEvent.dataTransfer) dragEvent.dataTransfer.effectAllowed = 'move'
  draggedEvent.value = event
}

function onDragOver(dragEvent: DragEvent, day: Date) {
  const event = draggedEvent.value
  if (!event) return
  dragEvent.preventDefault()
  if (dragEvent.dataTransfer) dragEvent.dataTransfer.dropEffect = 'move'
  const column = dragEvent.currentTarget as HTMLElement
  const start = dropStartForPosition(day, dragEvent.clientY - column.getBoundingClientRect().top - dragOffsetPixels)
  const current = dragPreview.value
  if (current?.eventId === event.id && dateKey(current.day) === dateKey(day) && current.startsAt.getTime() === start.getTime()) return
  dragPreview.value = { eventId: event.id, day, startsAt: start, endsAt: new Date(start.getTime() + new Date(event.endsAt).getTime() - new Date(event.startsAt).getTime()) }
}

function onDrop(dragEvent: DragEvent, day: Date) {
  dragEvent.preventDefault()
  const event = draggedEvent.value
  if (!event) return
  const column = dragEvent.currentTarget as HTMLElement
  const startsAt = dropStartForPosition(day, dragEvent.clientY - column.getBoundingClientRect().top - dragOffsetPixels)
  void saveEventTimes(event, startsAt, new Date(startsAt.getTime() + new Date(event.endsAt).getTime() - new Date(event.startsAt).getTime()))
}

function onResizeStart(pointerEvent: PointerEvent, event: CalendarEvent, day: Date, edge: EventResizeEdge) {
  if (busy.value) return
  const handle = pointerEvent.currentTarget as HTMLElement
  const column = handle.parentElement
  if (!column) return
  pointerEvent.preventDefault()
  pointerEvent.stopPropagation()
  handle.setPointerCapture(pointerEvent.pointerId)
  resizeSession = { event, day, edge, columnTop: column.getBoundingClientRect().top, pointerY: pointerEvent.clientY, moved: false }
  resizingEvent.value = event
  dragPreview.value = { eventId: event.id, day, startsAt: new Date(event.startsAt), endsAt: new Date(event.endsAt) }
}

function onResizeMove(pointerEvent: PointerEvent) {
  const session = resizeSession
  if (!session || Math.abs(pointerEvent.clientY - session.pointerY) < 3) return
  session.moved = true
  const times = resizeEventTimes(session.event, session.day, session.edge, pointerEvent.clientY - session.columnTop)
  const current = dragPreview.value
  // Times snap to 15 minutes, so most pointer moves change nothing.
  if (current && current.startsAt.getTime() === times.startsAt.getTime() && current.endsAt.getTime() === times.endsAt.getTime()) return
  dragPreview.value = { eventId: session.event.id, day: session.day, ...times }
}

function onResizeEnd(pointerEvent: PointerEvent) {
  const session = resizeSession
  if (!session) return
  pointerEvent.preventDefault()
  pointerEvent.stopPropagation()
  resizeSession = null
  if (!session.moved) {
    resizingEvent.value = null
    dragPreview.value = null
    return
  }
  const times = resizeEventTimes(session.event, session.day, session.edge, pointerEvent.clientY - session.columnTop)
  void saveEventTimes(session.event, times.startsAt, times.endsAt)
}

function onResizeCancel() {
  resizeSession = null
  resizingEvent.value = null
  dragPreview.value = null
}

function step(direction: 1 | -1) {
  visibleDate.value = addDays(visibleDate.value, direction * (view.value === 'week' ? 7 : 1))
}

function previewClass(event: CalendarEvent) {
  const color = normalizeCalendarColor(event.color)
  return new Date(event.endsAt).getTime() <= currentTime.value ? PAST_EVENT_COLOR_CLASSES[color] : EVENT_COLOR_CLASSES[color]
}
</script>

<template>
  <div class="contents">
    <!-- display: contents keeps both panels direct flex children of the dashboard group. -->
  <CalendarUpcomingPanel :events="events" @select="editEvent" />

  <UDashboardPanel id="calendar" :ui="{ body: 'p-0 sm:p-0 overscroll-contain' }">
    <template #header>
      <UDashboardNavbar :ui="{ title: 'hidden' }">
        <template #leading>
          <UDashboardSidebarCollapse class="lg:hidden" />
          <CalendarUpcomingButton :events="events" @select="editEvent" />
          <CalendarSectionNav />
        </template>
      </UDashboardNavbar>
      <UDashboardToolbar>
        <template #left>
          <h1 class="sr-only">
            {{ t('account.calendar') }}
          </h1>
          <CalendarMonthPicker v-model="visibleDate" />
        </template>
        <template #right>
          <UButton icon="i-lucide-chevron-left" color="neutral" variant="ghost" :aria-label="t(view === 'week' ? 'calendar.previousView.week' : 'calendar.previousView.day')" @click="step(-1)" />
          <UButton icon="i-lucide-chevron-right" color="neutral" variant="ghost" :aria-label="t(view === 'week' ? 'calendar.nextView.week' : 'calendar.nextView.day')" @click="step(1)" />
          <UButton :label="t('calendar.today')" color="neutral" variant="outline" class="max-md:hidden" @click="visibleDate = new Date()" />
          <USelect v-model="view" :items="viewItems" :aria-label="t('calendar.view')" class="w-28 max-md:hidden" />
          <UDropdownMenu :items="mobileMenu" :content="{ align: 'end' }">
            <UButton icon="i-lucide-more-vertical" color="neutral" variant="ghost" class="md:hidden" :aria-label="t('calendar.options')" />
          </UDropdownMenu>
          <UButton icon="i-lucide-plus" :label="t('calendar.newEvent')" :disabled="busy" class="max-md:hidden" @click="openNewEvent()" />
          <UButton icon="i-lucide-plus" :aria-label="t('calendar.newEvent')" :disabled="busy" class="md:hidden" @click="openNewEvent()" />
        </template>
      </UDashboardToolbar>
      <UProgress v-if="loading" size="2xs" class="absolute inset-x-0 top-0" />
    </template>

    <template #body>
      <section :aria-busy="loading" class="min-h-0 min-w-0">
        <div :class="view === 'week' ? 'min-w-190' : 'min-w-90'">
          <div class="sticky top-0 z-30 grid h-14 border-b border-default bg-default" :style="{ gridTemplateColumns: gridColumns }">
            <div />
            <div
              v-for="day in days"
              :key="dateKey(day)"
              class="border-l border-default px-3 py-2 text-xs"
              :class="dateKey(day) === dateKey(today) ? 'text-primary' : 'text-default'"
            >
              {{ formatUserDate(day, { weekday: 'short' }) }}
              <span class="block text-2xl font-medium">{{ formatUserDate(day, { day: 'numeric' }) }}</span>
            </div>
          </div>
          <div class="grid" :style="{ gridTemplateColumns: gridColumns, height: `${hourCount * CALENDAR_HOUR_HEIGHT}px` }">
            <div class="relative">
              <span
                v-for="index in hourCount"
                :key="index"
                class="absolute right-3 text-xs text-muted"
                :class="index === 1 ? '' : '-translate-y-1/2'"
                :style="{ top: `${(index - 1) * CALENDAR_HOUR_HEIGHT}px` }"
              >{{ (index - 1) % 2 === 0 ? '' : formatHour(CALENDAR_START_HOUR + index - 1) }}</span>
            </div>
            <div
              v-for="day in days"
              :key="dateKey(day)"
              class="calendar-day-column relative border-l border-default"
              :style="{ backgroundSize: `100% ${CALENDAR_HOUR_HEIGHT}px` }"
              @dragover="onDragOver($event, day)"
              @drop="onDrop($event, day)"
            >
              <button
                type="button"
                :aria-label="t('calendar.addEventOn', { date: formatUserDate(day, { dateStyle: 'short' }) })"
                class="absolute inset-0 z-0 cursor-crosshair"
                @click="openNewEvent(day, dropStartForPosition(day, $event.offsetY))"
              />
              <CalendarDayEvents
                :day="day"
                :events="events"
                :current-time="currentTime"
                :busy="busy"
                :active-event-id="activeEventId"
                @edit="editEvent"
                @drag-start="onDragStart"
                @drag-end="clearDrag"
                @resize-start="onResizeStart"
                @resize-move="onResizeMove"
                @resize-end="onResizeEnd"
                @resize-cancel="onResizeCancel"
              />
              <div
                v-if="dragPreview && previewEvent && previewPosition && dateKey(dragPreview.day) === dateKey(day)"
                class="pointer-events-none absolute inset-x-1 z-20 rounded-lg border-2 border-dashed border-default"
                :class="previewClass(previewEvent)"
                :style="{ top: `${previewPosition.top}px`, height: `${previewPosition.height}px` }"
              >
                <span class="absolute top-0 left-1 z-10 rounded bg-inverted px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap text-inverted">
                  {{ formatEventRange(previewEvent) }}
                </span>
                <span v-if="previewPosition.height >= 50" class="block truncate px-2 pt-6 text-xs font-semibold">{{ previewEvent.title }}</span>
              </div>
              <div
                v-if="dateKey(day) === dateKey(now)"
                aria-hidden="true"
                class="pointer-events-none absolute inset-x-0 z-30"
                :style="{ top: `${currentTimePosition(now)}px` }"
              >
                <div class="h-0.5 w-full bg-primary" />
                <div class="absolute -top-1.5 -left-1.5 size-3.5 rounded-full bg-primary" />
              </div>
            </div>
          </div>
        </div>
      </section>
    </template>
  </UDashboardPanel>

  <CalendarEventEditor ref="editor" v-model:open="editorOpen" :mailbox="mailbox" @saved="onSaved" />
  </div>
</template>

<style scoped>
.calendar-day-column {
  background-image: linear-gradient(to bottom, transparent calc(100% - 1px), var(--ui-border) calc(100% - 1px));
}
</style>
