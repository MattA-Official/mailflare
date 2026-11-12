<script setup lang="ts">
// Public page for booking one meeting: pick a day, a time, then enter details.
// Served at /c/<username>/<slug> and /book/<userId>/<eventId>.
// Ported from legacy/src/app/book/[userId]/[eventId]/page.tsx.
import { getDisplayLocale, getUserTimeZone } from '#lib/time/utils'
import type { BookingSlot, PublicBookingEvent } from '~/types/calendar'
import { bookingTimeZones, calendarDays, formatCalendarDate, localDateIn, moveMonth, readBookingPageSelection, submitPublicBooking, writeBookingPageSelection } from '~/utils/calendar/public-booking'

const props = defineProps<{ username?: string, userId?: string, identifier: string }>()
const { t } = useLanguage()

const endpoint = computed(() => `/api/public/booking/${encodeURIComponent(props.identifier)}${props.username ? `?username=${encodeURIComponent(props.username)}` : ''}`)
const event = ref<PublicBookingEvent | null>(null)
const hostName = ref('')
const slots = ref<BookingSlot[]>([])
const timeZone = ref('UTC')
const month = ref('')
const selectedDate = ref(new Date().toISOString().slice(0, 10))
const selectedSlot = ref<BookingSlot | null>(null)
const name = ref('')
const email = ref('')
const guestEmails = ref('')
const showGuests = ref(false)
const notes = ref('')
const loading = ref(true)
const submitting = ref(false)
const done = ref(false)
const error = ref('')

const slotsByDate = computed(() => {
  const grouped = new Map<string, BookingSlot[]>()
  for (const slot of slots.value) {
    const date = localDateIn(slot.startsAt, timeZone.value)
    grouped.set(date, [...(grouped.get(date) ?? []), slot])
  }
  return grouped
})
const availableDates = computed(() => [...slotsByDate.value.keys()].sort())
const todayDate = computed(() => localDateIn(new Date(), timeZone.value))
const visibleMonth = computed(() => month.value || todayDate.value.slice(0, 7))
const firstMonth = computed(() => availableDates.value[0]?.slice(0, 7))
const lastMonth = computed(() => availableDates.value.at(-1)?.slice(0, 7))
const timeZoneItems = computed(() => event.value ? bookingTimeZones(event.value.timeZone, timeZone.value).map(zone => ({ label: zone.replaceAll('_', ' '), value: zone })) : [])
const daySlots = computed(() => slotsByDate.value.get(selectedDate.value) ?? [])
const weekdayHeads = computed(() => t('public.weekdayHeads').split('|'))

function formatIn(value: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(getDisplayLocale(), { ...options, timeZone: timeZone.value }).format(new Date(value))
}

const selectedSummary = computed(() => {
  const slot = selectedSlot.value
  if (!slot) return ''
  const time = { hour: 'numeric', minute: '2-digit', hourCycle: 'h23' } as const
  return `${formatIn(slot.startsAt, time)} – ${formatIn(slot.endsAt, time)}, ${formatIn(slot.startsAt, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`
})

function restoreSelection() {
  const selection = readBookingPageSelection(window.location.search)
  const zone = selection.timeZone ?? getUserTimeZone()
  const slot = slots.value.find(item => item.startsAt === selection.slotStartsAt) ?? null
  const date = slot ? localDateIn(slot.startsAt, zone) : selection.date ?? localDateIn(new Date(), zone)
  timeZone.value = zone
  selectedDate.value = date
  selectedSlot.value = slot
  month.value = date.slice(0, 7)
  if (!loading.value || !selection.slotStartsAt) {
    if (selection.date !== date || (new URLSearchParams(window.location.search).has('slot') && !slot) || !selection.timeZone) writeBookingPageSelection(date, slot?.startsAt ?? null, zone, true)
  }
}

onMounted(() => window.addEventListener('popstate', restoreSelection))
onBeforeUnmount(() => window.removeEventListener('popstate', restoreSelection))
watch([slots, loading], restoreSelection, { immediate: true })

watch(endpoint, async () => {
  loading.value = true
  try {
    const response = await fetch(endpoint.value)
    if (!response.ok) throw new Error()
    const data = await response.json() as { event: PublicBookingEvent, hostName: string, slots: BookingSlot[] }
    if (props.userId && data.event.userId !== props.userId) throw new Error()
    event.value = data.event
    hostName.value = data.hostName
    slots.value = data.slots
  } catch {
    error.value = t('public.unavailable')
  } finally {
    loading.value = false
  }
}, { immediate: true })

useHead({ title: () => event.value?.name ?? t('public.bookMeeting') })

function chooseDate(date: string) {
  selectedDate.value = date
  error.value = ''
  writeBookingPageSelection(date, null, timeZone.value)
}

function chooseSlot(slot: BookingSlot) {
  selectedSlot.value = slot
  error.value = ''
  writeBookingPageSelection(selectedDate.value, slot.startsAt, timeZone.value)
}

function backToCalendar() {
  selectedSlot.value = null
  error.value = ''
  writeBookingPageSelection(selectedDate.value, null, timeZone.value, true)
}

function changeTimeZone(zone: string) {
  const nextToday = localDateIn(new Date(), zone)
  timeZone.value = zone
  selectedDate.value = nextToday
  month.value = nextToday.slice(0, 7)
  writeBookingPageSelection(nextToday, null, zone)
}

function dayLabel(date: string) {
  const count = slotsByDate.value.get(date)?.length
  return `${formatCalendarDate(date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}${date === todayDate.value ? t('public.today') : ''}${count ? t('public.availableTimes', { count }) : t('public.noTimesDay')}`
}

async function book() {
  const slot = selectedSlot.value
  if (!slot) return
  submitting.value = true
  error.value = ''
  try {
    await submitPublicBooking(endpoint.value, slot.startsAt, name.value, email.value, guestEmails.value, notes.value)
    done.value = true
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('public.bookFailed')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="min-h-dvh bg-muted p-4 max-sm:px-0 max-sm:pb-0 sm:px-6 lg:h-dvh lg:overflow-hidden lg:pb-0">
    <div class="mx-auto max-w-[1500px] lg:flex lg:h-full lg:min-h-0 lg:flex-col">
      <UButton
        v-if="selectedSlot && !done"
        icon="i-lucide-arrow-left"
        :label="t('public.backToCalendar')"
        color="neutral"
        variant="link"
        class="mb-3 self-start max-sm:ml-4"
        @click="backToCalendar"
      />
      <UButton
        v-else
        icon="i-lucide-arrow-left"
        :label="t('public.allMeetings')"
        :to="username ? `/c/${username}` : `/book/${userId}`"
        color="neutral"
        variant="link"
        class="mb-3 self-start max-sm:ml-4"
      />

      <div v-if="loading" role="status" :aria-label="t('public.loadingAvailability')" class="grid overflow-hidden rounded-t-3xl bg-default lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(240px,.95fr)_minmax(380px,1.65fr)_minmax(240px,.95fr)]">
        <span class="sr-only">{{ t('public.loadingAvailabilityEllipsis') }}</span>
        <div class="space-y-6 border-b border-default p-7 sm:p-9 lg:border-r lg:border-b-0">
          <USkeleton class="h-6 w-2/3" />
          <USkeleton class="h-4 w-full" />
          <USkeleton class="h-4 w-4/5" />
        </div>
        <div class="border-b border-default p-7 sm:p-9 lg:border-r lg:border-b-0">
          <USkeleton class="h-6 w-1/2" />
          <div class="mx-auto mt-10 grid max-w-[440px] grid-cols-7 gap-2">
            <USkeleton v-for="index in 35" :key="index" class="aspect-square" />
          </div>
        </div>
        <div class="space-y-3 p-7 sm:p-9">
          <USkeleton class="mb-6 h-6 w-3/4" />
          <USkeleton v-for="item in 5" :key="item" class="h-11" />
        </div>
      </div>

      <UCard v-else-if="!event">
        <p class="text-sm text-toned">
          {{ error }}
        </p>
      </UCard>

      <div
        v-else
        class="grid overflow-hidden rounded-t-3xl bg-default lg:min-h-0 lg:flex-1"
        :class="selectedSlot || done ? 'lg:grid-cols-[minmax(260px,1fr)_minmax(420px,2fr)]' : 'lg:grid-cols-[minmax(240px,.95fr)_minmax(380px,1.65fr)_minmax(240px,.95fr)]'"
      >
        <aside class="flex min-w-0 flex-col border-r border-b border-default p-7 max-sm:p-5 sm:p-9 lg:min-h-0 lg:overflow-y-auto lg:border-b-0">
          <h1 class="text-xl font-semibold tracking-tight text-highlighted">
            {{ event.name }}
          </h1>
          <p v-if="event.description" class="mt-2 text-sm leading-6 whitespace-pre-wrap text-toned">
            {{ event.description }}
          </p>
          <div class="mt-4 space-y-5 border-t border-default pt-4 text-sm font-medium text-toned">
            <p class="flex items-start gap-3">
              <UIcon name="i-lucide-clock-3" class="size-[18px] shrink-0" />{{ t('public.minutes', { count: event.durationMinutes }) }}
            </p>
            <p v-if="event.location" class="flex items-start gap-3">
              <UIcon name="i-lucide-map-pin" class="size-[18px] shrink-0" />{{ event.location }}
            </p>
            <template v-if="selectedSlot">
              <p class="flex items-start gap-3">
                <UIcon name="i-lucide-calendar-days" class="size-[18px] shrink-0" /><span>{{ selectedSummary }}</span>
              </p>
              <p class="flex items-start gap-3">
                <UIcon name="i-lucide-globe-2" class="size-[18px] shrink-0" />{{ timeZone.replaceAll('_', ' ') }}
              </p>
            </template>
            <p v-if="hostName" class="flex items-start gap-3">
              <UIcon name="i-lucide-users" class="size-[18px] shrink-0" /><span>{{ hostName }}</span>
            </p>
          </div>
          <span class="flex-1 max-sm:hidden" />
          <CalendarPublicFooter class="mt-8" />
        </aside>

        <section v-if="done" class="flex min-h-0 flex-col items-center justify-center px-8 py-20 text-center">
          <div class="mb-5 flex size-14 items-center justify-center rounded-full bg-success/10 text-success">
            <UIcon name="i-lucide-check" class="size-7" />
          </div>
          <h2 class="text-2xl font-semibold text-highlighted">
            {{ t('public.booked') }}
          </h2>
          <p class="mt-3 text-sm text-muted">
            {{ t('public.scheduledFor', { when: selectedSlot ? formatIn(selectedSlot.startsAt, { dateStyle: 'full', timeStyle: 'short' }) : '' }) }}
          </p>
        </section>

        <form v-else-if="selectedSlot" class="min-h-0 space-y-6 overflow-y-auto p-7 max-sm:p-5 sm:p-10" @submit.prevent="book">
          <h2 class="text-2xl font-medium text-highlighted">
            {{ t('public.enterDetails') }}
          </h2>
          <UFormField :label="t('public.name')" required>
            <UInput v-model="name" required :maxlength="120" autocomplete="name" class="w-full" />
          </UFormField>
          <UFormField :label="t('public.email')" required>
            <UInput v-model="email" required type="email" :maxlength="254" autocomplete="email" class="w-full" />
          </UFormField>
          <UFormField v-if="showGuests" :label="t('public.guestEmails')" :hint="t('public.commaSeparated')">
            <UInput v-model="guestEmails" placeholder="guest@example.com" class="w-full" />
          </UFormField>
          <UButton v-else :label="t('public.addGuests')" color="neutral" variant="outline" class="rounded-full" @click="showGuests = true" />
          <UFormField :label="t('public.notes')">
            <UTextarea v-model="notes" :maxlength="2000" :rows="4" class="w-full" />
          </UFormField>
          <p v-if="error" role="alert" class="text-sm text-error">
            {{ error }}
          </p>
          <UButton type="submit" size="lg" class="rounded-full px-7" :loading="submitting" :disabled="submitting || !name.trim() || !email.trim()" :label="submitting ? t('public.booking') : t('public.schedule')" />
        </form>

        <template v-else>
          <section class="min-w-0 border-b border-default lg:min-h-0 lg:overflow-y-auto">
            <div class="mx-auto my-2 flex max-w-[440px] items-center justify-between gap-3 px-5 md:mt-8">
              <h3 class="flex-1 text-lg font-semibold text-highlighted">
                {{ formatCalendarDate(`${visibleMonth}-01`, { month: 'long', year: 'numeric' }) }}
              </h3>
              <UButton icon="i-lucide-chevron-left" color="neutral" variant="outline" :aria-label="t('public.prevMonth')" :disabled="!firstMonth || moveMonth(visibleMonth, -1) < firstMonth" @click="month = moveMonth(visibleMonth, -1)" />
              <UButton icon="i-lucide-chevron-right" color="neutral" variant="outline" :aria-label="t('public.nextMonth')" :disabled="!lastMonth || moveMonth(visibleMonth, 1) > lastMonth" @click="month = moveMonth(visibleMonth, 1)" />
            </div>
            <div class="mx-auto mt-6 grid max-w-[440px] grid-cols-7 text-center text-sm text-muted max-sm:px-5">
              <span v-for="head in weekdayHeads" :key="head">{{ head }}</span>
            </div>
            <div class="mx-auto mt-2 mb-6 grid max-w-[440px] grid-cols-7 max-sm:px-5">
              <div v-for="(date, index) in calendarDays(visibleMonth)" :key="date || `blank-${index}`" class="aspect-square min-w-0">
                <button
                  v-if="date"
                  type="button"
                  :disabled="!slotsByDate.has(date) && date !== todayDate"
                  :aria-label="dayLabel(date)"
                  :aria-current="date === todayDate ? 'date' : undefined"
                  :aria-pressed="selectedDate === date"
                  class="flex size-full items-center justify-center rounded-lg text-base"
                  :class="selectedDate === date ? 'bg-primary text-inverted' : slotsByDate.has(date) || date === todayDate ? 'text-primary hover:bg-primary/10' : 'cursor-not-allowed text-dimmed'"
                  @click="chooseDate(date)"
                >
                  <span
                    class="relative flex size-10 items-center justify-center rounded-full"
                    :class="[
                      selectedDate === date ? 'font-semibold' : slotsByDate.has(date) ? 'bg-primary/10 font-medium' : '',
                      date === todayDate && selectedDate !== date ? 'ring-2 ring-primary/40 ring-offset-2 ring-offset-default' : '',
                    ]"
                  >
                    {{ Number(date.slice(-2)) }}
                    <span v-if="date === todayDate && selectedDate === date" aria-hidden="true" class="absolute bottom-1 size-1 rounded-full bg-inverted" />
                  </span>
                </button>
              </div>
            </div>
            <div class="mx-auto my-4 flex w-full max-w-[440px] min-w-0 items-center gap-2 pr-2 pl-3 text-sm text-toned max-sm:px-5">
              <UIcon name="i-lucide-globe-2" class="size-4 shrink-0" />
              <label for="booking-time-zone" class="shrink-0 whitespace-nowrap">{{ t('public.timeZone') }}</label>
              <USelectMenu
                id="booking-time-zone"
                :model-value="timeZone"
                :items="timeZoneItems"
                value-key="value"
                variant="ghost"
                class="ml-auto min-w-0 flex-1"
                @update:model-value="changeTimeZone(String($event))"
              />
            </div>
            <p v-if="slots.length === 0" class="mt-6 px-5 text-sm text-muted">
              {{ t('public.noTimes60') }}
            </p>
          </section>
          <section v-if="selectedDate" :key="selectedDate" class="flex min-h-0 flex-col p-7 max-sm:p-5 sm:p-9 lg:overflow-hidden">
            <h3 class="mb-6 shrink-0 text-lg font-semibold text-highlighted">
              {{ formatCalendarDate(selectedDate, { weekday: 'long', month: 'short', day: 'numeric' }) }}
            </h3>
            <div class="max-h-[50dvh] min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 lg:max-h-none">
              <p v-if="daySlots.length === 0" class="text-sm text-muted">
                {{ t('public.noTimesDate') }}
              </p>
              <UButton
                v-for="slot in daySlots"
                :key="slot.startsAt"
                block
                size="lg"
                color="primary"
                variant="outline"
                :label="new Intl.DateTimeFormat(getDisplayLocale(), { hour: 'numeric', minute: '2-digit', hour12: true, timeZone }).format(new Date(slot.startsAt))"
                @click="chooseSlot(slot)"
              />
            </div>
          </section>
        </template>
      </div>
    </div>
  </main>
</template>
