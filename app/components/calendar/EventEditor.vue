<script setup lang="ts">
// Create/edit dialog for a calendar event, including the save and delete requests.
// Ported from the editor half of legacy/src/app/(calendar)/calendar/page.tsx.
import { getUserTimeZone, parseUserDateTimeLocal } from '#lib/time/utils'
import { normalizeCalendarColor } from '#lib/calendar/colors'
import { REMINDER_MINUTE_OPTIONS } from '#lib/calendar/reminder-utils'
import { DEFAULT_REPEAT_DAYS, parseCalendarRepeatDays } from '#lib/calendar/recurrence'
import { DEFAULT_FOLDER_COLOR, FOLDER_COLOR_OPTIONS } from '#lib/folders/colors'
import { folderColorKeys } from '#lib/folders/color-keys'
import type { TranslationKey } from '#lib/i18n/types'
import type { CalendarRepeat } from '#lib/calendar/types'
import type { CalendarEvent, CalendarMailbox } from '~/types/calendar'
import { calendarAnchorDay, defaultCalendarStart, eventEndAfterMinutes, formatLocalDateTime, rescheduleCalendarOccurrence, WEEKDAY_OPTIONS } from '~/utils/calendar/calendar'

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
const endsAt = ref('')
const durationOptionsOpen = ref(false)
const guests = ref('')
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

const parsedStart = computed(() => parseUserDateTimeLocal(startsAt.value))
const parsedEnd = computed(() => parseUserDateTimeLocal(endsAt.value))
const canSave = computed(() => Boolean(title.value.trim() && parsedStart.value && parsedEnd.value && parsedEnd.value > parsedStart.value && !(repeat.value === 'weekdays' && repeatDays.value.length === 0) && pending.value !== 'save'))

function senderAddress() {
  const mailbox = props.mailbox
  return mailbox?.senderAddresses?.[0] ?? (mailbox ? `${mailbox.localPart}@${mailbox.hostname}` : '')
}

function openNew(day: Date, startAt?: Date) {
  const start = startAt ? new Date(startAt) : defaultCalendarStart(day)
  editing.value = null
  title.value = ''
  color.value = DEFAULT_FOLDER_COLOR
  repeat.value = 'none'
  repeatDays.value = [...DEFAULT_REPEAT_DAYS]
  reminderMinutes.value = null
  guests.value = ''
  location.value = ''
  description.value = ''
  startsAt.value = formatLocalDateTime(start)
  endsAt.value = formatLocalDateTime(new Date(start.getTime() + 60 * 60_000))
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
  startsAt.value = formatLocalDateTime(new Date(event.startsAt))
  endsAt.value = formatLocalDateTime(new Date(event.endsAt))
  durationOptionsOpen.value = false
  let attendees: string[] = []
  try { attendees = JSON.parse(event.attendees || '[]') as string[] } catch { /* Unreadable guest lists start empty. */ }
  guests.value = attendees.join(', ')
  open.value = true
}

defineExpose({ openNew, openEdit })

function toggleRepeatDay(day: number) {
  repeatDays.value = repeatDays.value.includes(day) ? repeatDays.value.filter(value => value !== day) : [...repeatDays.value, day].sort((a, b) => a - b)
}

async function save() {
  pending.value = 'save'
  try {
    const event = editing.value
    const editedStart = event && startsAt.value === formatLocalDateTime(new Date(event.startsAt)) ? new Date(event.startsAt) : parsedStart.value
    const editedEnd = event && endsAt.value === formatLocalDateTime(new Date(event.endsAt)) ? new Date(event.endsAt) : parsedEnd.value
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
        effectiveFrom: effectiveFrom?.toISOString(),
        moveOccurrenceToPast: movingToPast,
        attendees: guests.value.split(','),
        timeZone: getUserTimeZone(),
        description: description.value,
        location: location.value,
        mailboxId: props.mailbox?.id,
        from: senderAddress(),
      },
    })
    emit('saved')
    open.value = false
  } catch (error) {
    toast.add({ title: error instanceof ApiError ? error.message : t('calendar.saveFailed'), color: 'error' })
  } finally {
    pending.value = null
  }
}

async function remove() {
  const event = editing.value
  if (!event) return
  const recurring = event.repeat !== 'none'
  if (!window.confirm(recurring ? t('calendar.deleteFuture') : t('calendar.deleteEvent'))) return
  pending.value = 'delete'
  try {
    await api(`/api/calendar/events/${event.id}`, { method: 'DELETE', body: recurring ? { effectiveFrom: new Date().toISOString() } : undefined })
    emit('saved')
    open.value = false
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
          class="w-full"
          :ui="{ base: 'text-xl font-medium' }"
          autofocus
        />

        <div class="grid grid-cols-[24px_minmax(0,1fr)] items-start gap-3">
          <UIcon name="i-lucide-clock-3" class="mt-2 size-5 text-muted" />
          <div class="min-w-0" @focusout="onTimesFocusOut">
            <div class="grid gap-2 sm:grid-cols-2">
              <UFormField :label="t('calendar.from')">
                <UInput v-model="startsAt" type="datetime-local" :aria-label="t('calendar.fromLabel')" class="w-full" @focus="durationOptionsOpen = true" />
              </UFormField>
              <UFormField :label="t('calendar.to')">
                <UInput v-model="endsAt" type="datetime-local" :aria-label="t('calendar.toLabel')" class="w-full" @focus="durationOptionsOpen = true" />
              </UFormField>
            </div>
            <div v-if="durationOptionsOpen" class="flex flex-wrap gap-1 pt-1" :aria-label="t('calendar.setDuration')">
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
          <USelect v-model="reminderValue" :items="reminderItems" :aria-label="t('calendar.reminder')" variant="ghost" class="w-full" />
        </div>

        <div class="grid grid-cols-[24px_minmax(0,1fr)] items-start gap-3">
          <UIcon name="i-lucide-repeat-2" class="mt-2 size-5 text-muted" />
          <div class="min-w-0">
            <USelect v-model="repeat" :items="repeatItems" :aria-label="t('calendar.repeat')" variant="ghost" class="w-full" />
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
          <UInput v-model="guests" :placeholder="t('calendar.addGuests')" :aria-label="t('calendar.guestsLabel')" variant="ghost" class="w-full" />
          <p v-if="guestReplies" class="col-start-2 mt-1 px-2 text-xs text-muted">
            {{ t('calendar.guestResponses', { list: guestReplies }) }}
          </p>
        </div>

        <div class="grid grid-cols-[24px_minmax(0,1fr)] items-center gap-3">
          <UIcon name="i-lucide-map-pin" class="size-5 text-muted" />
          <UInput v-model="location" :placeholder="t('calendar.addLocation')" :aria-label="t('calendar.location')" variant="ghost" class="w-full" />
        </div>

        <div class="grid grid-cols-[24px_minmax(0,1fr)] items-start gap-3">
          <UIcon name="i-lucide-align-left" class="mt-2 size-5 text-muted" />
          <UTextarea v-model="description" :placeholder="t('calendar.addDescription')" :aria-label="t('calendar.description')" variant="ghost" autoresize :rows="1" class="w-full" />
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
