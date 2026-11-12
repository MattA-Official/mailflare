<script setup lang="ts">
// Upcoming events grouped by day, revealed in batches as the list scrolls.
// Ported from legacy/src/app/(calendar)/upcoming-sidebar.tsx.
import { normalizeCalendarColor } from '#lib/calendar/colors'
import type { CalendarEvent } from '~/types/calendar'
import { addDays, expandCalendarEvents, formatEventRange, groupUpcomingEvents, startOfDay, takeUpcomingGroups, UPCOMING_BATCH_SIZE } from '~/utils/calendar/calendar'

const props = defineProps<{
  /** Events the page already loaded. Without them the list loads the next 90 days itself. */
  events?: CalendarEvent[]
  /** Refetch (keeping the current list on screen) when this value changes. */
  refreshKey?: unknown
}>()
const emit = defineEmits<{ select: [event: CalendarEvent] }>()

const { t } = useLanguage()
const today = startOfDay(new Date())
const loadedEvents = shallowRef<CalendarEvent[]>([])
const loaded = ref(false)
const loadError = ref(false)
const visibleCount = ref(UPCOMING_BATCH_SIZE)
const scrollRef = useTemplateRef<HTMLElement>('scroll')
const sentinelRef = useTemplateRef<HTMLElement>('sentinel')

const shownEvents = computed(() => props.events ?? loadedEvents.value)
const groups = computed(() => groupUpcomingEvents(shownEvents.value, today, t))
const total = computed(() => groups.value.reduce((count, group) => count + group.events.length, 0))
const visibleGroups = computed(() => takeUpcomingGroups(groups.value, visibleCount.value))
const awaiting = computed(() => props.events === undefined && !loaded.value && !loadError.value)

async function load() {
  if (props.events !== undefined) return
  const end = addDays(today, 90)
  try {
    const data = await api<{ events?: CalendarEvent[] }>(`/api/calendar/events?start=${today.toISOString()}&end=${end.toISOString()}`)
    loadedEvents.value = expandCalendarEvents(data.events ?? [], today, end)
    loadError.value = false
    loaded.value = true
  } catch {
    loadError.value = true
  }
}

watch(() => [props.events === undefined, props.refreshKey], () => void load(), { immediate: true })
watch(shownEvents, () => { visibleCount.value = UPCOMING_BATCH_SIZE })

let observer: IntersectionObserver | null = null
watchEffect((onCleanup) => {
  if (visibleCount.value >= total.value || !scrollRef.value || !sentinelRef.value) return
  observer = new IntersectionObserver(([entry]) => {
    if (!entry?.isIntersecting) return
    observer?.disconnect()
    visibleCount.value = Math.min(visibleCount.value + UPCOMING_BATCH_SIZE, total.value)
  }, { root: scrollRef.value, rootMargin: '0px 0px 100px 0px' })
  observer.observe(sentinelRef.value)
  onCleanup(() => observer?.disconnect())
})
</script>

<template>
  <div ref="scroll" class="h-full overflow-y-auto overscroll-contain">
    <div v-if="awaiting" class="space-y-6" :aria-label="t('calendar.loadingUpcoming')" aria-busy="true">
      <div v-for="group in 2" :key="group">
        <USkeleton class="mb-3 h-4 w-28" />
        <div class="space-y-3">
          <div v-for="row in 3" :key="row" class="flex items-start gap-3">
            <USkeleton class="mt-0.5 size-4 shrink-0 rounded-full" />
            <span class="min-w-0 flex-1 space-y-1.5">
              <USkeleton class="h-3.5 w-3/4" />
              <USkeleton class="h-3 w-1/2" />
            </span>
          </div>
        </div>
      </div>
    </div>
    <p v-else-if="groups.length === 0" class="text-sm text-muted">
      {{ loadError ? t('calendar.upcomingLoadFailed') : t('calendar.noUpcoming') }}
    </p>
    <template v-else>
      <section v-for="group in visibleGroups" :key="group.key" class="mb-6 last:mb-0">
        <h3 class="sticky top-0 z-10 mb-2 bg-default py-2 text-sm font-semibold text-highlighted">
          {{ group.label }}
        </h3>
        <div class="space-y-2">
          <button
            v-for="event in group.events"
            :key="event.id"
            type="button"
            class="group flex w-full items-start gap-3 text-left"
            @click="emit('select', event)"
          >
            <span class="mt-0.5 size-4 shrink-0 rounded-full border-2 border-default ring-1 ring-default" :style="{ backgroundColor: normalizeCalendarColor(event.color) }" />
            <span class="min-w-0">
              <span class="block truncate text-sm text-default group-hover:text-highlighted">{{ event.title }}</span>
              <span class="block text-xs text-muted">{{ formatEventRange(event) }}</span>
            </span>
          </button>
        </div>
      </section>
    </template>
    <div v-if="visibleCount < total" ref="sentinel" aria-hidden="true" class="h-1" />
  </div>
</template>
