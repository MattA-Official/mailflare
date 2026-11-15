<script setup lang="ts">
// Quick look at an event clicked in the calendar: when, where, who and what, with Edit and Delete.
// Not in upstream, which opened the editor straight away.
import { formatUserDate } from '#lib/time/utils'
import { normalizeCalendarColor } from '#lib/calendar/colors'
import type { TranslationKey } from '#lib/i18n/types'
import type { CalendarEvent } from '~/types/calendar'
import { dateKey, formatAllDayRange, formatEventRange, formatEventTime, isAllDay } from '~/utils/calendar/calendar'

const props = defineProps<{
  event: CalendarEvent | null
  /** The event block that was clicked; the popover sits beside it. */
  reference: HTMLElement | null
}>()
const emit = defineEmits<{ edit: [event: CalendarEvent], delete: [event: CalendarEvent] }>()
const open = defineModel<boolean>('open', { default: false })
const { t } = useLanguage()

const when = computed(() => {
  const event = props.event
  if (!event) return ''
  const start = new Date(event.startsAt)
  const end = new Date(event.endsAt)
  if (isAllDay(event)) return `${formatAllDayRange(event)} · ${t('calendar.allDay')}`
  const day = (value: Date) => formatUserDate(value, { weekday: 'short', day: 'numeric', month: 'short' })
  // An event that runs past midnight names both days.
  if (dateKey(start) !== dateKey(new Date(end.getTime() - 1))) return `${day(start)}, ${formatEventTime(start)} – ${day(end)}, ${formatEventTime(end)}`
  return `${day(start)}, ${formatEventRange(event)}`
})

const guests = computed(() => {
  const event = props.event
  if (!event) return []
  let attendees: string[] = []
  let replies: Record<string, string> = {}
  try { attendees = JSON.parse(event.attendees || '[]') as string[] } catch { /* None. */ }
  try { replies = JSON.parse(event.attendeeResponses || '{}') as Record<string, string> } catch { /* None. */ }
  return attendees.filter(Boolean).map(email => ({
    email,
    reply: replies[email] ? t(`calendar.guestResponse.${replies[email]}` as TranslationKey) : null,
  }))
})

function choose(action: 'edit' | 'delete') {
  const event = props.event
  open.value = false
  if (!event) return
  if (action === 'edit') emit('edit', event)
  else emit('delete', event)
}
</script>

<template>
  <UPopover
    v-model:open="open"
    :reference="reference ?? undefined"
    :content="{ side: 'right', align: 'start', sideOffset: 8, collisionPadding: 12 }"
    :ui="{ content: 'w-80 max-w-[calc(100vw-2rem)]' }"
  >
    <template #content>
      <div v-if="event" class="space-y-3 p-4">
        <div class="flex items-start gap-3">
          <span class="mt-1.5 size-3 shrink-0 rounded-full" :style="{ backgroundColor: normalizeCalendarColor(event.color) }" />
          <div class="min-w-0 flex-1">
            <h2 class="text-base font-semibold break-words text-highlighted">
              {{ event.title }}
            </h2>
            <p class="text-sm text-muted">
              {{ when }}
            </p>
            <p v-if="event.repeat !== 'none'" class="text-sm text-muted">
              {{ t(`calendar.repeat.${event.repeat}`) }}
            </p>
          </div>
          <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" :aria-label="t('common.close')" @click="open = false" />
        </div>
        <div v-if="event.location" class="flex items-start gap-3 text-sm">
          <UIcon name="i-lucide-map-pin" class="mt-0.5 size-4 shrink-0 text-muted" :aria-label="t('calendar.location')" />
          <span class="min-w-0 break-words">{{ event.location }}</span>
        </div>
        <div v-if="guests.length" class="flex items-start gap-3 text-sm">
          <UIcon name="i-lucide-users-round" class="mt-0.5 size-4 shrink-0 text-muted" :aria-label="t('calendar.guests')" />
          <ul class="min-w-0 space-y-0.5">
            <li v-for="guest in guests" :key="guest.email" class="break-all">
              {{ guest.email }}<span v-if="guest.reply" class="text-muted"> · {{ guest.reply }}</span>
            </li>
          </ul>
        </div>
        <div v-if="event.reminderMinutes != null" class="flex items-start gap-3 text-sm">
          <UIcon name="i-lucide-bell" class="mt-0.5 size-4 shrink-0 text-muted" :aria-label="t('calendar.reminder')" />
          <span>{{ t(`calendar.reminder.m${event.reminderMinutes}` as TranslationKey) }}</span>
        </div>
        <div v-if="event.description" class="flex items-start gap-3 text-sm">
          <UIcon name="i-lucide-align-left" class="mt-0.5 size-4 shrink-0 text-muted" :aria-label="t('calendar.description')" />
          <p class="line-clamp-6 min-w-0 break-words whitespace-pre-line">
            {{ event.description }}
          </p>
        </div>
        <div class="flex justify-end gap-2 pt-1">
          <UButton icon="i-lucide-trash-2" :label="t('common.delete')" color="error" variant="ghost" size="sm" @click="choose('delete')" />
          <UButton icon="i-lucide-pencil" :label="t('common.edit')" size="sm" @click="choose('edit')" />
        </div>
      </div>
    </template>
  </UPopover>
</template>
