<script setup lang="ts">
// Month, week and day calendar with drag-to-move, resize, an event editor and invitation answers.
// Ported from legacy/src/app/(calendar)/calendar/page.tsx and the (calendar) layout.
import { formatUserDate, getUserTimeZone } from '#lib/time/utils'
import { normalizeCalendarColor } from '#lib/calendar/colors'
import { parseCalendarRepeatDays } from '#lib/calendar/recurrence'
import type { ShortcutDefinition } from '~/types/shortcuts'
import type { CalendarEvent, CalendarMailbox, CalendarView, EventDragPreview, EventResizeEdge, EventResizeSession } from '~/types/calendar'
import {
  addDays, addMonths, calendarAnchorDay, eventDayKeys, isAllDay, PENDING_EVENT_CLASSES, CALENDAR_END_HOUR, CALENDAR_HOUR_HEIGHT, CALENDAR_START_HOUR,
  currentTimePosition, dateKey, dropStartForPosition, EVENT_COLOR_CLASSES, eventPosition, expandCalendarEvents,
  formatEventRange, formatHour, isPendingInvite, monthGridDates, PAST_EVENT_COLOR_CLASSES, rescheduleCalendarOccurrence, resizeEventTimes, shiftEventByDays, slotMinutesForPosition, slotSelectionTimes, startOfDay, startOfWeek,
} from '~/utils/calendar/calendar'
import { useMediaQuery, useSwipe } from '@vueuse/core'
import { loadSelectedMailbox } from '~/utils/calendar/mailbox'

definePageMeta({ layout: 'dashboard', nav: 'calendar', auth: { feature: 'calendar' } })

const { t } = useLanguage()
const toast = useToast()
const route = useRoute()
const router = useRouter()
useHead({ title: () => t('account.calendar') })

const events = shallowRef<CalendarEvent[]>([])
const eventsVersion = ref(0)
const currentTime = ref(Date.now())
const visibleDate = ref(new Date())
const VIEW_STORAGE_KEY = 'mailflare.calendar.view'
const view = ref<CalendarView>('week')
const subscribeOpen = ref(false)
const pendingInvite = shallowRef<CalendarEvent | null>(null)
const draggedEvent = shallowRef<CalendarEvent | null>(null)
const resizingEvent = shallowRef<CalendarEvent | null>(null)
const dragPreview = shallowRef<EventDragPreview | null>(null)
const pendingId = ref<string | null>(null)
const mailbox = shallowRef<CalendarMailbox | null>(null)
const editorOpen = ref(false)
const editor = useTemplateRef<{ openNew: (day: Date, startAt?: Date, endAt?: Date, allDay?: boolean) => void, openEdit: (event: CalendarEvent) => void, remove: (event?: CalendarEvent | null) => Promise<void> }>('editor')
// The highlighted range on the hour grid: shown while dragging out a new event and while its editor is open.
const slotSelection = shallowRef<{ day: Date, startsAt: Date, endsAt: Date } | null>(null)
let dragOffsetPixels = 0
let resizeSession: EventResizeSession | null = null

const isPhone = useMediaQuery('(max-width: 767px)')
// All-day events go in the row above the hour grid, not on it.
const timedEvents = computed(() => events.value.filter(event => !isAllDay(event)))
const allDayRow = computed(() => days.value.map((day) => {
  const key = dateKey(day)
  return { key, events: events.value.filter((event) => {
    if (!isAllDay(event)) return false
    const span = eventDayKeys(event)
    return span.first <= key && key <= span.last
  }) }
}))
const now = computed(() => new Date(currentTime.value))
const today = computed(() => startOfDay(now.value))
const weekStart = computed(() => startOfWeek(visibleDate.value))
const days = computed(() => view.value === 'day' ? [startOfDay(visibleDate.value)] : Array.from({ length: 7 }, (_, index) => addDays(weekStart.value, index)))
const gridColumns = computed(() => `64px repeat(${days.value.length}, minmax(0, 1fr))`)
const hourCount = CALENDAR_END_HOUR - CALENDAR_START_HOUR
const busy = computed(() => pendingId.value !== null)
const activeEventId = computed(() => draggedEvent.value?.id ?? resizingEvent.value?.id ?? null)
const VIEWS = ['month', 'week', 'day'] as const
// The menu beside New event: Today (narrow screens only), connecting a calendar app, and the view.
const optionsMenu = computed(() => [
  [
    { label: t('calendar.today'), class: 'md:hidden', onSelect: () => { visibleDate.value = new Date() } },
    { label: t('calendar.subscribe'), onSelect: () => { subscribeOpen.value = true } },
  ],
  [
    { type: 'label' as const, label: t('calendar.view') },
    ...VIEWS.map(option => ({
      label: t(`calendar.${option}`),
      type: 'checkbox' as const,
      checked: view.value === option,
      onSelect: () => chooseView(option),
    })),
  ],
])

// Only a choice made in the view switcher is remembered; jumping into a day from the month grid is not.
function chooseView(next: CalendarView) {
  view.value = next
  try { localStorage.setItem(VIEW_STORAGE_KEY, next) } catch { /* Not remembered. */ }
}

const previewEvent = computed(() => {
  const source = draggedEvent.value ?? resizingEvent.value
  const preview = dragPreview.value
  return preview && source ? { ...source, startsAt: preview.startsAt.toISOString(), endsAt: preview.endsAt.toISOString() } : null
})
const previewPosition = computed(() => dragPreview.value && previewEvent.value ? eventPosition(previewEvent.value, dragPreview.value.day) : null)

let clock: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  clock = setInterval(() => { currentTime.value = Date.now() }, 60_000)
  let saved: string | null = null
  try { saved = localStorage.getItem(VIEW_STORAGE_KEY) } catch { /* Storage can be blocked; the default view is fine. */ }
  if (saved === 'month' || saved === 'week' || saved === 'day') view.value = saved
  // A week is wider than a phone, so phones open on a day unless a view was chosen before.
  else if (isPhone.value) view.value = 'day'
  loadSelectedMailbox().then((value) => { mailbox.value = value }).catch(() => {})
})
onBeforeUnmount(() => clearInterval(clock))

// Week and day views open scrolled to an hour before now (or 08:00 when today is not shown) rather than midnight.
const grid = useTemplateRef<HTMLElement>('grid')
function scrollToWorkingHours() {
  const section = grid.value
  if (!section || view.value === 'month') return
  let scroller: HTMLElement | null = section.parentElement
  while (scroller && scroller.scrollHeight <= scroller.clientHeight) scroller = scroller.parentElement
  if (!scroller) return
  const showsToday = days.value.some(day => dateKey(day) === dateKey(now.value))
  const top = showsToday ? currentTimePosition(now.value) - CALENDAR_HOUR_HEIGHT : 8 * CALENDAR_HOUR_HEIGHT
  scroller.scrollTop = Math.max(0, top)
}
onMounted(() => nextTick(scrollToWorkingHours))

// Calendar keys, listed in the shortcuts cheat sheet while the calendar is open (C stays Compose).
// Registered during setup, so they are dropped again when the page unmounts.
const { registerShortcut } = useShortcuts()
const calendarShortcuts: ShortcutDefinition[] = [
  { key: 't', label: t('shortcut.calendarToday'), category: 'Calendar', action: () => { visibleDate.value = new Date() } },
  { key: 'j', label: t('shortcut.calendarNext'), category: 'Calendar', action: () => step(1) },
  { key: 'k', label: t('shortcut.calendarPrevious'), category: 'Calendar', action: () => step(-1) },
  { key: 'd', label: t('shortcut.calendarDayView'), category: 'Calendar', action: () => chooseView('day') },
  { key: 'w', label: t('shortcut.calendarWeekView'), category: 'Calendar', action: () => chooseView('week') },
  { key: 'm', label: t('shortcut.calendarMonthView'), category: 'Calendar', action: () => chooseView('month') },
  { key: 'n', label: t('shortcut.calendarNewEvent'), category: 'Calendar', action: () => { if (!busy.value) openNewEvent() } },
]
// Not while the event editor or another dialog is open over the calendar.
for (const shortcut of calendarShortcuts) {
  registerShortcut({ ...shortcut, action: () => { if (!editorOpen.value && !pendingInvite.value && !subscribeOpen.value) shortcut.action() } })
}

// Swiping sideways moves to the previous or next day, week or month, except where the grid is wider
// than the screen and a sideways swipe scrolls it (the week view on a phone).
useSwipe(grid, {
  threshold: 60,
  onSwipeEnd(_event, direction) {
    if (slotDrag?.active || Date.now() - slotDragEndedAt < 500 || resizeSession || draggedEvent.value) return
    if (view.value === 'week' && isPhone.value) return
    if (direction === 'left') step(1)
    else if (direction === 'right') step(-1)
  },
})
watch(view, () => nextTick(scrollToWorkingHours), { flush: 'post' })

// Dragging on empty grid creates an event for the range dragged over. A mouse or pen drags straight
// away; a finger holds still for a moment first, so an ordinary swipe still scrolls the grid.
const LONG_PRESS_MS = 400
interface SlotDrag { day: Date, column: HTMLElement, pointerId: number, anchor: number, current: number, startY: number, active: boolean, timer?: ReturnType<typeof setTimeout> }
let slotDrag: SlotDrag | null = null
// A finger lifted from a selection also ends a touch gesture, which must not count as a swipe.
let slotDragEndedAt = 0
let suppressSlotClick = false

function showSlotSelection(drag: SlotDrag) {
  const times = slotSelectionTimes(drag.day, drag.anchor, drag.current)
  const current = slotSelection.value
  if (current && current.startsAt.getTime() === times.startsAt.getTime() && current.endsAt.getTime() === times.endsAt.getTime()) return
  slotSelection.value = { day: drag.day, ...times }
}

function startSlotDrag(drag: SlotDrag) {
  drag.active = true
  try { drag.column.setPointerCapture(drag.pointerId) } catch { /* The pointer has gone; pointerup tidies up. */ }
  showSlotSelection(drag)
}

function endSlotDrag() {
  if (slotDrag?.timer) clearTimeout(slotDrag.timer)
  slotDrag = null
}

function onSlotPointerDown(pointerEvent: PointerEvent, day: Date) {
  if (busy.value || pointerEvent.button !== 0 || slotDrag) return
  const column = pointerEvent.currentTarget as HTMLElement
  const anchor = slotMinutesForPosition(pointerEvent.clientY - column.getBoundingClientRect().top)
  const drag: SlotDrag = { day, column, pointerId: pointerEvent.pointerId, anchor, current: anchor, startY: pointerEvent.clientY, active: false }
  slotDrag = drag
  if (pointerEvent.pointerType === 'touch') {
    drag.timer = setTimeout(() => { if (slotDrag === drag) startSlotDrag(drag) }, LONG_PRESS_MS)
    return
  }
  // Keeps the browser from selecting text while the pointer drags.
  pointerEvent.preventDefault()
  startSlotDrag(drag)
}

function onSlotPointerMove(pointerEvent: PointerEvent) {
  const drag = slotDrag
  if (!drag || pointerEvent.pointerId !== drag.pointerId) return
  if (!drag.active) {
    // A finger that moves before the long press is scrolling, not selecting.
    if (Math.abs(pointerEvent.clientY - drag.startY) > 8) endSlotDrag()
    return
  }
  // Measured each time, as the grid can scroll during a drag.
  drag.current = slotMinutesForPosition(pointerEvent.clientY - drag.column.getBoundingClientRect().top)
  showSlotSelection(drag)
}

function onSlotPointerUp(pointerEvent: PointerEvent) {
  const drag = slotDrag
  if (!drag || pointerEvent.pointerId !== drag.pointerId) return
  endSlotDrag()
  // A tap before the long press falls through to the click handler.
  if (!drag.active) return
  suppressSlotClick = true
  slotDragEndedAt = Date.now()
  const times = slotSelectionTimes(drag.day, drag.anchor, drag.current)
  // A press without a drag keeps the usual hour-long event.
  const endsAt = drag.anchor === drag.current ? new Date(times.startsAt.getTime() + 60 * 60_000) : times.endsAt
  slotSelection.value = { day: drag.day, startsAt: times.startsAt, endsAt }
  openNewEvent(drag.day, times.startsAt, endsAt)
}

function cancelSlotDrag() {
  endSlotDrag()
  slotSelection.value = null
}

// Taps, and Enter or Space on the focused slot, which has no position to go by.
function onSlotClick(mouseEvent: MouseEvent, day: Date) {
  if (suppressSlotClick) {
    suppressSlotClick = false
    return
  }
  if (mouseEvent.detail === 0) {
    openNewEvent(day)
    return
  }
  const column = mouseEvent.currentTarget as HTMLElement
  const anchor = slotMinutesForPosition(mouseEvent.clientY - column.getBoundingClientRect().top)
  const slotStart = slotSelectionTimes(day, anchor, anchor).startsAt
  const endsAt = new Date(slotStart.getTime() + 60 * 60_000)
  slotSelection.value = { day, startsAt: slotStart, endsAt }
  openNewEvent(day, slotStart, endsAt)
}

// Once a long press has started a selection, the finger's movement drags it rather than scrolling.
function blockTouchScroll(touchEvent: TouchEvent) {
  if (slotDrag?.active) touchEvent.preventDefault()
}
function cancelSlotDragOnEscape(keyEvent: KeyboardEvent) {
  if (keyEvent.key === 'Escape' && slotDrag) cancelSlotDrag()
}
onMounted(() => {
  window.addEventListener('touchmove', blockTouchScroll, { passive: false })
  window.addEventListener('keydown', cancelSlotDragOnEscape)
})
onBeforeUnmount(() => {
  window.removeEventListener('touchmove', blockTouchScroll)
  window.removeEventListener('keydown', cancelSlotDragOnEscape)
  endSlotDrag()
})
watch(editorOpen, (value) => {
  if (!value) slotSelection.value = null
})

const range = computed(() => {
  // The month view needs the whole six-week grid.
  const monthDates = view.value === 'month' ? monthGridDates(visibleDate.value) : null
  return {
    start: new Date(Math.min(today.value.getTime(), weekStart.value.getTime(), startOfDay(visibleDate.value).getTime(), monthDates?.[0]?.getTime() ?? Infinity)),
    end: new Date(Math.max(addDays(today.value, 90).getTime(), addDays(weekStart.value, 7).getTime(), addDays(visibleDate.value, 1).getTime(), monthDates?.[41] ? addDays(monthDates[41], 1).getTime() : 0)),
  }
})

// Events for the visible range. One key for the page, so the calendar keeps showing what it has while
// another range loads, and a failed load leaves it in place.
const { data: loadedEvents, status: eventsStatus, error: eventsError } = useAsyncData('calendar-events', () => {
  const { start, end } = range.value
  return api<{ events?: CalendarEvent[] }>(`/api/calendar/events?start=${start.toISOString()}&end=${end.toISOString()}`)
    .then(data => expandCalendarEvents(data.events ?? [], start, end))
}, { watch: [() => range.value.start.getTime(), () => range.value.end.getTime(), eventsVersion] })
const loading = computed(() => eventsStatus.value === 'pending')
watch(loadedEvents, (value) => {
  if (value) events.value = value
}, { immediate: true })
watch(eventsError, (error) => {
  if (error) toast.add({ title: t('calendar.loadFailed'), color: 'error' })
})

// /calendar?event=<id> (from the upcoming list elsewhere) opens that event once it has loaded.
watch([events, () => route.query.event], () => {
  const id = typeof route.query.event === 'string' ? route.query.event : null
  if (!id) return
  const event = events.value.find(item => item.id === id)
  if (!event) return
  editEvent(event)
  void router.replace({ query: {} })
}, { immediate: true })

function openNewEvent(day = visibleDate.value, startAt?: Date, endAt?: Date, allDay = false) {
  editor.value?.openNew(day, startAt, endAt, allDay)
}

// The element last clicked, so a click on an event can open its popover beside it.
let clickedElement: HTMLElement | null = null
const popoverEvent = shallowRef<CalendarEvent | null>(null)
const popoverReference = shallowRef<HTMLElement | null>(null)
const popoverOpen = ref(false)

function rememberClick(mouseEvent: MouseEvent) {
  clickedElement = (mouseEvent.target as Element | null)?.closest('button') ?? null
}

// A click on an event shows its details first; links from elsewhere (?event=) go straight to the editor.
function selectEvent(event: CalendarEvent) {
  const reference = clickedElement
  clickedElement = null
  if (isPendingInvite(event) || !reference?.isConnected) {
    editEvent(event)
    return
  }
  popoverEvent.value = event
  popoverReference.value = reference
  popoverOpen.value = true
}

function editEvent(event: CalendarEvent) {
  if (isPendingInvite(event)) {
    pendingInvite.value = event
    return
  }
  if (editor.value) editor.value.openEdit(event)
  else nextTick(() => editor.value?.openEdit(event))
}

function deleteEvent(event: CalendarEvent) {
  void editor.value?.remove(event)
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
  visibleDate.value = view.value === 'month'
    ? addMonths(visibleDate.value, direction)
    : addDays(visibleDate.value, direction * (view.value === 'week' ? 7 : 1))
}

function onMoveDays(event: CalendarEvent, days: number) {
  const times = shiftEventByDays(event, days)
  void saveEventTimes(event, times.startsAt, times.endsAt)
}

// Days dragged across in the month view: an all-day event over them.
function onSelectDays(first: Date, last: Date) {
  openNewEvent(first, first, last, true)
}

function openDay(day: Date) {
  visibleDate.value = day
  view.value = 'day'
}

function selectionStyle(selection: { day: Date, startsAt: Date, endsAt: Date }) {
  const position = eventPosition({ startsAt: selection.startsAt.toISOString(), endsAt: selection.endsAt.toISOString() }, selection.day)
  return position ? { top: `${position.top}px`, height: `${position.height}px` } : { display: 'none' }
}

function previewClass(event: CalendarEvent) {
  if (isPendingInvite(event)) return PENDING_EVENT_CLASSES
  const color = normalizeCalendarColor(event.color)
  return new Date(event.endsAt).getTime() <= currentTime.value ? PAST_EVENT_COLOR_CLASSES[color] : EVENT_COLOR_CLASSES[color]
}
</script>

<template>
  <div class="contents" @click.capture="rememberClick">
    <!-- display: contents keeps both panels direct flex children of the dashboard group. -->
  <CalendarUpcomingPanel :events="events" @select="selectEvent" />

  <UDashboardPanel id="calendar" :ui="{ body: 'p-0 sm:p-0 overscroll-contain' }">
    <template #header>
      <UDashboardNavbar :ui="{ title: 'hidden' }">
        <template #leading>
          <UDashboardSidebarCollapse class="lg:hidden" />
          <CalendarUpcomingButton :events="events" @select="editEvent" />
          <CalendarSectionNav />
        </template>
        <template #right>
          <AgentAssistantToggle />
          <AppAppsMenu />
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
          <UButton icon="i-lucide-chevron-left" color="neutral" variant="ghost" :aria-label="t(`calendar.previousView.${view}`)" @click="step(-1)" />
          <UButton icon="i-lucide-chevron-right" color="neutral" variant="ghost" :aria-label="t(`calendar.nextView.${view}`)" @click="step(1)" />
          <UButton :label="t('calendar.today')" color="neutral" variant="outline" class="max-md:hidden" @click="visibleDate = new Date()" />
          <UFieldGroup class="ms-1">
            <UButton icon="i-lucide-plus" :label="t('calendar.newEvent')" :aria-label="t('calendar.newEvent')" :ui="{ label: 'max-sm:hidden' }" :disabled="busy" @click="openNewEvent()" />
            <UDropdownMenu :items="optionsMenu" :content="{ align: 'end' }">
              <UButton icon="i-lucide-chevron-down" :aria-label="t('calendar.options')" class="border-s border-inverted/30" />
            </UDropdownMenu>
          </UFieldGroup>
        </template>
      </UDashboardToolbar>
      <UProgress v-if="loading" size="2xs" class="absolute inset-x-0 top-0" />
    </template>

    <template #body>
      <section ref="grid" :aria-busy="loading" class="min-h-0 min-w-0" :class="view === 'month' && 'h-full'">
        <CalendarMonthGrid
          v-if="view === 'month'"
          :month="visibleDate"
          :today="today"
          :events="events"
          :current-time="currentTime"
          :compact="isPhone"
          :busy="busy"
          @select-day="openNewEvent($event)"
          @select-days="onSelectDays"
          @move="onMoveDays"
          @open-day="openDay"
          @edit="selectEvent"
        />
        <div v-else :class="view === 'week' ? 'min-w-190' : 'min-w-90'">
          <div class="sticky top-0 z-30 grid border-b border-default bg-default" :style="{ gridTemplateColumns: gridColumns }">
            <div />
            <div
              v-for="day in days"
              :key="dateKey(day)"
              class="h-14 border-l border-default px-3 py-2 text-xs"
              :class="dateKey(day) === dateKey(today) ? 'text-primary' : 'text-default'"
            >
              {{ formatUserDate(day, { weekday: 'short' }) }}
              <span class="block text-2xl font-medium">{{ formatUserDate(day, { day: 'numeric' }) }}</span>
            </div>
            <!-- All-day events sit in their own row above the hours. -->
            <template v-if="allDayRow.some(cell => cell.events.length)">
              <span class="self-center pe-2 text-end text-[11px] text-muted">{{ t('calendar.allDay') }}</span>
              <div v-for="cell in allDayRow" :key="cell.key" class="min-w-0 space-y-0.5 border-l border-default p-1">
                <button
                  v-for="event in cell.events"
                  :key="`${event.id}-${event.startsAt}`"
                  type="button"
                  :title="`${event.title} · ${t('calendar.allDay')}`"
                  class="block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium hover:brightness-95"
                  :class="previewClass(event)"
                  @click="selectEvent(event)"
                >
                  {{ event.title }}
                </button>
              </div>
            </template>
          </div>
          <div class="grid" :style="{ gridTemplateColumns: gridColumns, height: `${hourCount * CALENDAR_HOUR_HEIGHT}px` }">
            <div class="relative">
              <!-- Every hour but the first, centred on its line. -->
              <span
                v-for="hour in hourCount - 1"
                :key="hour"
                class="absolute right-2 -translate-y-1/2 text-xs whitespace-nowrap text-muted tabular-nums"
                :style="{ top: `${hour * CALENDAR_HOUR_HEIGHT}px` }"
              >{{ formatHour(CALENDAR_START_HOUR + hour) }}</span>
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
                class="absolute inset-0 z-0 cursor-crosshair select-none [-webkit-touch-callout:none]"
                @pointerdown="onSlotPointerDown($event, day)"
                @pointermove="onSlotPointerMove"
                @pointerup="onSlotPointerUp"
                @pointercancel="cancelSlotDrag"
                @contextmenu.prevent
                @click="onSlotClick($event, day)"
              />
              <div
                v-if="slotSelection && dateKey(slotSelection.day) === dateKey(day)"
                aria-hidden="true"
                class="pointer-events-none absolute inset-x-1 z-20 overflow-hidden rounded-lg border-2 border-primary bg-primary/15 px-2 text-primary"
                :style="selectionStyle(slotSelection)"
              >
                <span class="block truncate text-xs leading-4 font-semibold">{{ t('calendar.newEvent') }}</span>
                <span class="block truncate text-[11px] leading-4">{{ formatEventRange({ startsAt: slotSelection.startsAt.toISOString(), endsAt: slotSelection.endsAt.toISOString() }) }}</span>
              </div>
              <CalendarDayEvents
                :day="day"
                :events="timedEvents"
                :current-time="currentTime"
                :busy="busy"
                :active-event-id="activeEventId"
                @edit="selectEvent"
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
  <CalendarEventPopover v-model:open="popoverOpen" :event="popoverEvent" :reference="popoverReference" @edit="editEvent" @delete="deleteEvent" />
  <CalendarSubscribeDialog v-model:open="subscribeOpen" />
  <CalendarInviteResponseDialog :event="pendingInvite" @close="pendingInvite = null" @answered="onSaved" />
  </div>
</template>

<style scoped>
.calendar-day-column {
  background-image: linear-gradient(to bottom, transparent calc(100% - 1px), var(--ui-border) calc(100% - 1px));
}
</style>
