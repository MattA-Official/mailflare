<script setup lang="ts">
// Create/edit dialog for a calendar event, including the save and delete requests.
// Ported from the editor half of legacy/src/app/(calendar)/calendar/page.tsx.
import { confirmDestructive } from '~/utils/confirm-dialog'
import { getUserTimeZone, parseUserDateTimeLocal } from '#lib/time/utils'
import { normalizeCalendarColor } from '#lib/calendar/colors'
import { REMINDER_MINUTE_OPTIONS } from '#lib/calendar/reminder-utils'
import { DEFAULT_REPEAT_DAYS, parseCalendarRepeatDays } from '#lib/calendar/recurrence'
import { DEFAULT_FOLDER_COLOR, FOLDER_COLOR_OPTIONS } from '#lib/folders/colors'
import { folderColorKeys } from '#lib/folders/color-keys'
import type { TranslationKey } from '#lib/i18n/types'
import type { CalendarRepeat } from '#lib/calendar/types'
import type { CalendarEvent, CalendarMailbox } from '~/types/calendar'
import { addDays, calendarAnchorDay, defaultCalendarStart, isAllDay, eventEndAfterMinutes, formatLocalDateTime, rescheduleCalendarOccurrence, WEEKDAY_OPTIONS } from '~/utils/calendar/calendar'

const props = defineProps<{ mailbox: CalendarMailbox | null }>()
const emit = defineEmits<{ saved: [] }>()

const open = defineModel<boolean>('open', { default: false })
const { t } = useLanguage()
const toast = useToast()

const editing = shallowRef<CalendarEvent | null>(null)
const title = ref('')
const color = ref<string>(DEFAULT_FOLDER_COLOR)
const repeat = ref<CalendarRepeat>('none')
const repeatDays = ref<number[]>([...DEFAULT_REPEAT_DAYS])
const reminderMinutes = ref<number | null>(null)
const startsAt = ref('')
// For an all-day event, both fields hold dates (with T00:00), and the end is the last day, inclusive.
const endsAt = ref('')
const allDay = ref(false)
const durationOptionsOpen = ref(false)
const guests = ref<string[]>([])
const location = ref('')
const description = ref('')
const pending = ref<'save' | 'delete' | null>(null)
// Answers guests sent back to an invitation from this calendar.
const guestReplies = computed(() => {
  try {
    const responses = JSON.parse(editing.value?.attendeeResponses || '{}') as Record<string, string>
    return Object.entries(responses).map(([email, status]) => `${email} ${t(`calendar.guestResponse.${status}` as TranslationKey)}`).join(', ')
  }
  catch {
    return ''
  }
})

const NO_REMINDER = 'none'
const reminderItems = computed(() => [
  { label: t('calendar.reminder.none'), value: NO_REMINDER },
  ...REMINDER_MINUTE_OPTIONS.map(minutes => ({ label: t(`calendar.reminder.m${minutes}` as TranslationKey), value: String(minutes) })),
])
const reminderValue = computed({
  get: () => reminderMinutes.value === null ? NO_REMINDER : String(reminderMinutes.value),
  set: (value: string) => { reminderMinutes.value = value === NO_REMINDER ? null : Number(value) },
})
const repeatItems = computed(() => (['none', 'daily', 'weekly', 'monthly', 'weekdays'] as const).map(value => ({ label: t(`calendar.repeat.${value}`), value })))
const durationPresets = [15, 30, 60, 1440] as const

const atMidnight = (value: string) => `${value.slice(0, 10)}T00:00`
const parsedStart = computed(() => parseUserDateTimeLocal(allDay.value ? atMidnight(startsAt.value) : startsAt.value))
// An all-day event ends at midnight after its last day.
const parsedEnd = computed(() => {
  if (!allDay.value) return parseUserDateTimeLocal(endsAt.value)
  const lastDay = parseUserDateTimeLocal(atMidnight(endsAt.value))
  return lastDay ? addDays(lastDay, 1) : null
})
const canSave = computed(() => Boolean(title.value.trim() && parsedStart.value && parsedEnd.value && parsedEnd.value > parsedStart.value && !(repeat.value === 'weekdays' && repeatDays.value.length === 0) && pending.value !== 'save'))

function senderAddress() {
  const mailbox = props.mailbox
  return mailbox?.senderAddresses?.[0] ?? (mailbox ? `${mailbox.localPart}@${mailbox.hostname}` : '')
}

/** With `wholeDays`, an all-day event from the day of `startAt` to the day of `endAt`, inclusive. */
function openNew(day: Date, startAt?: Date, endAt?: Date, wholeDays = false) {
  const start = startAt ? new Date(startAt) : defaultCalendarStart(day)
  const end = endAt && (wholeDays ? endAt >= start : endAt > start) ? new Date(endAt) : new Date(start.getTime() + 60 * 60_000)
  editing.value = null
  allDay.value = wholeDays
  title.value = ''
  color.value = DEFAULT_FOLDER_COLOR
  repeat.value = 'none'
  repeatDays.value = [...DEFAULT_REPEAT_DAYS]
  reminderMinutes.value = null
  guests.value = []
  location.value = ''
  description.value = ''
  startsAt.value = wholeDays ? atMidnight(formatLocalDateTime(start)) : formatLocalDateTime(start)
  endsAt.value = wholeDays ? atMidnight(formatLocalDateTime(end)) : formatLocalDateTime(end)
  durationOptionsOpen.value = false
  open.value = true
}

function openEdit(event: CalendarEvent) {
  editing.value = event
  title.value = event.title
  color.value = normalizeCalendarColor(event.color)
  repeat.value = event.repeat
  reminderMinutes.value = event.reminderMinutes ?? null
  repeatDays.value = event.repeat === 'weekdays' ? parseCalendarRepeatDays(event.repeatDays) : [...DEFAULT_REPEAT_DAYS]
  location.value = event.location ?? ''
  description.value = event.description ?? ''
  allDay.value = isAllDay(event)
  startsAt.value = formatLocalDateTime(new Date(event.startsAt))
  // An all-day event shows its last day, the one before it ends.
  endsAt.value = allDay.value ? atMidnight(formatLocalDateTime(new Date(new Date(event.endsAt).getTime() - 1))) : formatLocalDateTime(new Date(event.endsAt))
  durationOptionsOpen.value = false
  let attendees: string[] = []
  try { attendees = JSON.parse(event.attendees || '[]') as string[] } catch { /* Unreadable guest lists start empty. */ }
  guests.value = attendees.map(entry => entry.trim()).filter(Boolean)
  open.value = true
}

defineExpose({ openNew, openEdit, remove })

// Turning all-day on keeps the dates; turning it off gives the first day the usual hour-long slot.
function setAllDay(value: boolean) {
  allDay.value = value
  durationOptionsOpen.value = false
  if (value) {
    startsAt.value = atMidnight(startsAt.value)
    endsAt.value = atMidnight(endsAt.value < startsAt.value ? startsAt.value : endsAt.value)
    return
  }
  const day = parseUserDateTimeLocal(atMidnight(startsAt.value))
  if (!day) return
  const start = defaultCalendarStart(day)
  startsAt.value = formatLocalDateTime(start)
  endsAt.value = formatLocalDateTime(new Date(start.getTime() + 60 * 60_000))
}

function toggleRepeatDay(day: number) {
  repeatDays.value = repeatDays.value.includes(day) ? repeatDays.value.filter(value => value !== day) : [...repeatDays.value, day].sort((a, b) => a - b)
}

async function save() {
  pending.value = 'save'
  try {
    const event = editing.value
    const keepTimes = event && !allDay.value && !isAllDay(event)
    const editedStart = keepTimes && startsAt.value === formatLocalDateTime(new Date(event.startsAt)) ? new Date(event.startsAt) : parsedStart.value
    const editedEnd = keepTimes && endsAt.value === formatLocalDateTime(new Date(event.endsAt)) ? new Date(event.endsAt) : parsedEnd.value
    if (!editedStart || !editedEnd || editedEnd <= editedStart) {
      toast.add({ title: t('calendar.invalidTimes'), color: 'error' })
      return
    }
    const movingToPast = Boolean(event && event.repeat !== 'none' && editedStart.getTime() < Date.now() && editedStart.getTime() !== new Date(event.startsAt).getTime())
    const effectiveFrom = event && event.repeat !== 'none' && !movingToPast ? new Date() : null
    let savedStart = editedStart
    let savedEnd = editedEnd
    if (event && effectiveFrom) {
      const next = rescheduleCalendarOccurrence(event, editedStart, editedEnd, effectiveFrom)
      if (!next) {
        toast.add({ title: t('calendar.noFuture'), color: 'error' })
        return
      }
      savedStart = next.startsAt
      savedEnd = next.endsAt
    }
    const repeatAnchorDay = event?.repeat === 'monthly' && startsAt.value.slice(0, 10) === formatLocalDateTime(new Date(event.startsAt)).slice(0, 10)
      ? event.repeatAnchorDay ?? calendarAnchorDay(event, new Date(event.seriesStartsAt ?? event.startsAt))
      : calendarAnchorDay(event, editedStart)
    await api(event ? `/api/calendar/events/${event.id}` : '/api/calendar/events', {
      method: event ? 'PATCH' : 'POST',
      body: {
        title: title.value,
        startsAt: savedStart.toISOString(),
        endsAt: savedEnd.toISOString(),
        color: color.value,
        repeat: repeat.value,
        repeatDays: repeatDays.value,
        repeatAnchorDay,
        reminderMinutes: reminderMinutes.value,
        allDay: allDay.value,
        effectiveFrom: effectiveFrom?.toISOString(),
        moveOccurrenceToPast: movingToPast,
        attendees: guests.value,
        timeZone: getUserTimeZone(),
        description: description.value,
        location: location.value,
        mailboxId: props.mailbox?.id,
        from: senderAddress(),
      },
    })
    emit('saved')
    open.value = false
    toast.add({ title: event ? t('calendar.eventSaved') : t('calendar.eventCreated'), color: 'success' })
  } catch (error) {
    toast.add({ title: error instanceof ApiError ? error.message : t('calendar.saveFailed'), color: 'error' })
  } finally {
    pending.value = null
  }
}

// Also called from the event popover, with the editor closed.
async function remove(event: CalendarEvent | null = editing.value) {
  if (!event) return
  const recurring = event.repeat !== 'none'
  if (!(await confirmDestructive(recurring ? t('calendar.deleteFuture') : t('calendar.deleteEvent')))) return
  pending.value = 'delete'
  try {
    await api(`/api/calendar/events/${event.id}`, { method: 'DELETE', body: recurring ? { effectiveFrom: new Date().toISOString() } : undefined })
    emit('saved')
    open.value = false
    toast.add({ title: t('calendar.eventDeleted'), color: 'success' })
  } catch (error) {
    toast.add({ title: error instanceof ApiError ? error.message : t('calendar.deleteFailed'), color: 'error' })
  } finally {
    pending.value = null
  }
}

function onTimesFocusOut(event: FocusEvent) {
  const container = event.currentTarget as HTMLElement
  if (!container.contains(event.relatedTarget as Node | null)) durationOptionsOpen.value = false
}

// The presets appear when a date or time segment takes focus. Not for the calendar button: the row
// appearing re-centres the dialog between pointerdown and click, so the click would miss the button.
function showDurations(event: FocusEvent) {
  if (!(event.target as HTMLElement | null)?.closest('button')) durationOptionsOpen.value = true
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="editing ? t('calendar.editEvent') : t('calendar.createEvent')"
    :dismissible="pending !== 'save'"
    :ui="{ content: 'max-w-xl max-h-[calc(100dvh-2rem)]', body: 'overflow-y-auto' }"
  >
    <template #body>
      <form class="space-y-3" @submit.prevent="canSave && save()">
        <UInput
          v-model="title"
          :placeholder="t('calendar.addTitle')"
          :aria-label="t('calendar.eventName')"
          variant="ghost"
          size="xl"
          :ui="{ base: 'text-xl font-medium' }"
          autofocus
        />

        <div class="grid grid-cols-[24px_minmax(0,1fr)] items-start gap-3">
          <UIcon name="i-lucide-clock-3" class="mt-2 size-5 text-muted" />
          <div class="min-w-0" @focusout="onTimesFocusOut">
            <div class="grid gap-2">
              <USwitch :model-value="allDay" :label="t('calendar.allDay')" @update:model-value="setAllDay" />
              <UFormField :label="t('calendar.from')">
                <AppDateTimeInput v-model="startsAt" :label="t('calendar.fromLabel')" :date-only="allDay" @focusin="showDurations" />
              </UFormField>
              <UFormField :label="t('calendar.to')">
                <AppDateTimeInput v-model="endsAt" :label="t('calendar.toLabel')" :date-only="allDay" @focusin="showDurations" />
              </UFormField>
            </div>
            <div v-if="durationOptionsOpen && !allDay" class="flex flex-wrap gap-1 pt-1" :aria-label="t('calendar.setDuration')">
              <UButton
                v-for="minutes in durationPresets"
                :key="minutes"
                :label="t(`calendar.dur.${minutes}`)"
                size="xs"
                color="neutral"
                variant="ghost"
                class="rounded-full"
                :disabled="!parsedStart"
                @click="endsAt = eventEndAfterMinutes(startsAt, minutes); durationOptionsOpen = false"
              />
            </div>
          </div>
        </div>

        <div class="grid grid-cols-[24px_minmax(0,1fr)] items-center gap-3">
          <UIcon name="i-lucide-bell" class="size-5 text-muted" />
          <USelect v-model="reminderValue" :items="reminderItems" :aria-label="t('calendar.reminder')" variant="ghost" />
        </div>

        <div class="grid grid-cols-[24px_minmax(0,1fr)] items-start gap-3">
          <UIcon name="i-lucide-repeat-2" class="mt-2 size-5 text-muted" />
          <div class="min-w-0">
            <USelect v-model="repeat" :items="repeatItems" :aria-label="t('calendar.repeat')" variant="ghost" />
            <div v-if="repeat === 'weekdays'" role="group" :aria-label="t('calendar.repeatOnWeekdays')" class="flex flex-wrap gap-1.5 px-2 pt-1">
              <UButton
                v-for="day in WEEKDAY_OPTIONS"
                :key="day"
                size="xs"
                class="rounded-full"
                :label="t(`calendar.weekdayShort.${day}` as TranslationKey)"
                :aria-label="t('calendar.repeatOn', { day: t(`weekday.${day}` as TranslationKey) })"
                :aria-pressed="repeatDays.includes(day)"
                :color="repeatDays.includes(day) ? 'primary' : 'neutral'"
                :variant="repeatDays.includes(day) ? 'solid' : 'soft'"
                @click="toggleRepeatDay(day)"
              />
            </div>
          </div>
        </div>

        <div class="grid grid-cols-[24px_minmax(0,1fr)] items-center gap-3">
          <UIcon name="i-lucide-users-round" class="size-5 text-muted" />
          <CalendarGuestInput v-model="guests" :mailbox-id="mailbox?.id" :placeholder="t('calendar.addGuests')" :aria-label="t('calendar.guestsLabel')" />
          <p v-if="guestReplies" class="col-start-2 mt-1 px-2 text-xs text-muted">
            {{ t('calendar.guestResponses', { list: guestReplies }) }}
          </p>
        </div>

        <div class="grid grid-cols-[24px_minmax(0,1fr)] items-center gap-3">
          <UIcon name="i-lucide-map-pin" class="size-5 text-muted" />
          <UInput v-model="location" :placeholder="t('calendar.addLocation')" :aria-label="t('calendar.location')" variant="ghost" />
        </div>

        <div class="grid grid-cols-[24px_minmax(0,1fr)] items-start gap-3">
          <UIcon name="i-lucide-align-left" class="mt-2 size-5 text-muted" />
          <UTextarea v-model="description" :placeholder="t('calendar.addDescription')" :aria-label="t('calendar.description')" variant="ghost" autoresize :rows="1" />
        </div>

        <div class="grid grid-cols-[24px_minmax(0,1fr)] items-center gap-3">
          <UIcon name="i-lucide-palette" class="size-5 text-muted" />
          <div role="radiogroup" :aria-label="t('calendar.eventColor')" class="flex flex-wrap items-center gap-1.5 px-2">
            <button
              v-for="option in FOLDER_COLOR_OPTIONS"
              :key="option.value"
              type="button"
              role="radio"
              :aria-label="t(folderColorKeys[option.value])"
              :title="t(folderColorKeys[option.value])"
              :aria-checked="color === option.value"
              class="size-7 rounded-full border-2 transition-transform hover:scale-110"
              :class="color === option.value ? 'border-inverted ring-2 ring-accented ring-offset-2 ring-offset-default' : 'border-transparent'"
              :style="{ backgroundColor: option.value }"
              @click="color = option.value"
            />
          </div>
        </div>

        <button type="submit" class="hidden" />
      </form>
    </template>
    <template #footer>
      <div class="flex w-full justify-between gap-2">
        <div>
          <UButton
            v-if="editing"
            icon="i-lucide-trash-2"
            :label="t('common.delete')"
            color="error"
            variant="ghost"
            :loading="pending === 'delete'"
            :disabled="pending !== null"
            @click="remove()"
          />
        </div>
        <UButton
          class="rounded-full px-6"
          :label="pending === 'save' ? t('common.saving') : t('settings.autoReply.save')"
          :loading="pending === 'save'"
          :disabled="!canSave"
          @click="save()"
        />
      </div>
    </template>
  </UModal>
</template>
