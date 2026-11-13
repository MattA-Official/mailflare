// Booking page helpers, ported from legacy/src/app/(calendar)/booking/utils.ts and default-events.ts.
import type { TranslationKey } from '#lib/i18n/types'
import { defaultTranslator, type Translator } from '#lib/i18n/utils'
import { parseBookingTimeRanges, slugifyBookingName, timeToMinutes } from '#lib/booking/utils'
import type { BookingTimeRange } from '#lib/booking/types'
import { DEFAULT_FOLDER_COLOR } from '#lib/folders/colors'
import { normalizeCalendarColor } from '#lib/calendar/colors'
import type { BookingEvent, BookingForm, BookingHost, BookingHostMatch } from '~/types/calendar'

export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const

/** Same rule as parseBookingHostIds in #lib/booking/hosts, which cannot be imported here (it pulls in the schema). */
export function parseBookingHostIds(value: string, ownerId: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value)
    if (Array.isArray(parsed) && parsed.length && parsed.every(id => typeof id === 'string' && id.length > 0) && new Set(parsed).size === parsed.length) {
      return [ownerId, ...(parsed as string[]).filter(id => id !== ownerId)]
    }
  } catch { /* Older booking events have only the owner. */ }
  return [ownerId]
}

export function emptyBookingForm(timeZone: string, currentUserId: string): BookingForm {
  return { name: '', slug: '', description: '', color: DEFAULT_FOLDER_COLOR, hostIds: [currentUserId], durationMinutes: 30, location: '', weekdays: [1, 2, 3, 4, 5], startTime: '09:00', endTime: '17:00', timeRanges: [{ startTime: '09:00', endTime: '17:00' }], timeZone, enabled: true, confirmationSubject: '', confirmationBody: '' }
}

export function formFromEvent(event: BookingEvent): BookingForm {
  let weekdays: number[] = []
  try { weekdays = JSON.parse(event.weekdays) as number[] } catch { /* An invalid saved schedule remains editable. */ }
  return { name: event.name, slug: event.slug, description: event.description ?? '', color: normalizeCalendarColor(event.color), hostIds: parseBookingHostIds(event.hostIds, event.userId), durationMinutes: event.durationMinutes, location: event.location, weekdays, startTime: event.startTime, endTime: event.endTime, timeRanges: parseBookingTimeRanges(event.timeRanges, { startTime: event.startTime, endTime: event.endTime }), timeZone: event.timeZone, enabled: event.enabled, confirmationSubject: event.confirmationSubject ?? '', confirmationBody: event.confirmationBody ?? '' }
}

export function bookingFormWithName(form: BookingForm, name: string): BookingForm {
  return { ...form, name, slug: !form.slug || form.slug === slugifyBookingName(form.name) ? slugifyBookingName(name) : form.slug }
}

export function matchBookingHost(hosts: BookingHost[], value: string, t: Translator = defaultTranslator): BookingHostMatch {
  const query = value.trim().toLowerCase()
  if (!query) return { host: null, error: t('booking.host.enterNameOrEmail') }
  if (query.includes('@')) {
    const host = hosts.find(item => item.email.toLowerCase() === query)
    return host ? { host, error: '' } : { host: null, error: t('booking.host.invalidEmail') }
  }
  const matches = hosts.filter(item => item.name.toLowerCase() === query || item.name.toLowerCase().startsWith(query))
  if (matches.length === 1) return { host: matches[0]!, error: '' }
  return { host: null, error: matches.length ? t('booking.host.multiple') : t('booking.host.notFound') }
}

export function durationLabel(minutes: number, t: Translator = defaultTranslator): string {
  return minutes === 60 ? t('booking.duration.hour') : minutes > 60 && minutes % 60 === 0 ? t('booking.duration.hours', { count: minutes / 60 }) : t('booking.duration.min', { count: minutes })
}

export function availabilityLabel(event: BookingEvent, t: Translator = defaultTranslator): string {
  const { weekdays } = formFromEvent(event)
  if (!weekdays.length) return t('booking.noDays')
  const days = weekdays.map(day => t(`calendar.weekdayShort.${day}` as TranslationKey)).join(', ')
  const ranges = parseBookingTimeRanges(event.timeRanges, { startTime: event.startTime, endTime: event.endTime })
  return `${days} · ${ranges.map(range => `${range.startTime}–${range.endTime}`).join(', ')}`
}

export function formAvailabilityLabel(form: BookingForm, t: Translator = defaultTranslator): string {
  if (!form.weekdays.length) return t('booking.noDays')
  const days = form.weekdays.map(day => t(`calendar.weekdayShort.${day}` as TranslationKey)).join(', ')
  const first = form.timeRanges[0]
  return `${days} · ${form.timeRanges.length === 1 && first ? `${first.startTime}–${first.endTime}` : t('booking.timeWindows', { count: form.timeRanges.length })}`
}

export function nextBookingTimeRange(ranges: BookingTimeRange[], durationMinutes: number): BookingTimeRange {
  const length = Math.ceil(Math.max(durationMinutes, 60) / 15) * 15
  const occupied = ranges.map(range => ({ start: timeToMinutes(range.startTime), end: timeToMinutes(range.endTime) })).sort((a, b) => a.start - b.start)
  let start = occupied.length ? occupied[occupied.length - 1]!.end : 9 * 60
  if (start + length > 23 * 60 + 45) {
    start = 0
    for (const range of occupied) {
      if (start + length <= range.start) break
      start = Math.max(start, range.end)
    }
  }
  const end = Math.min(start + length, 23 * 60 + 45)
  const format = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
  return { startTime: format(start), endTime: format(end) }
}

const DEFAULT_EVENTS = [
  { id: 'template:30-minute', name: '30 Minute Meeting', slug: '30-minute-meeting', durationMinutes: 30, startTime: '09:00', endTime: '11:00' },
  { id: 'template:15-minute', name: '15 Minute Meeting', slug: '15-minute-meeting', durationMinutes: 15, startTime: '14:00', endTime: '16:00' },
] as const

/** Until the user has made their own, the list offers two switched-off template meetings. */
export function visibleBookingEvents(events: BookingEvent[], userId: string, timeZone: string): BookingEvent[] {
  if (!userId || events.some(event => !DEFAULT_EVENTS.some(template => template.slug === event.slug))) return events
  const existingSlugs = new Set(events.map(event => event.slug))
  const templates: BookingEvent[] = DEFAULT_EVENTS.filter(template => !existingSlugs.has(template.slug)).map(template => ({
    ...template,
    userId,
    description: '',
    color: DEFAULT_FOLDER_COLOR,
    hostIds: JSON.stringify([userId]),
    location: '',
    weekdays: '[1,2,3,4,5]',
    timeRanges: JSON.stringify([{ startTime: template.startTime, endTime: template.endTime }]),
    timeZone,
    enabled: false,
    isTemplate: true as const,
  }))
  return [...events, ...templates]
}
