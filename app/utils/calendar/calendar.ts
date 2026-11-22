// Calendar grid and recurrence helpers, ported from legacy/src/app/(calendar)/calendar/utils.ts.
import { defaultTranslator, type Translator } from '#lib/i18n/utils'
import type { FolderColor } from '#lib/folders/types'
import type { CalendarRepeat } from '#lib/calendar/types'
import { parseCalendarRepeatDays, parseExcludedOccurrences } from '#lib/calendar/recurrence'
import { dateFromZonedFields, formatUserDate, getDisplayLocale, formatUserDateTimeLocal, getUserTimeZone, parseUserDateTimeLocal, zonedDateFields } from '#lib/time/utils'
import type { CalendarEvent, CalendarEventTimes, EventGroup, EventResizeEdge } from '~/types/calendar'

export const CALENDAR_START_HOUR = 0
export const CALENDAR_END_HOUR = 24
export const CALENDAR_HOUR_HEIGHT = 48
export const UPCOMING_BATCH_SIZE = 14
export const WEEKDAY_OPTIONS = [0, 1, 2, 3, 4, 5, 6] as const

export const EVENT_COLOR_CLASSES: Record<FolderColor, string> = {
  '#2563eb': 'bg-blue-600 text-white',
  '#7c3aed': 'bg-violet-600 text-white',
  '#db2777': 'bg-pink-600 text-white',
  '#dc2626': 'bg-red-600 text-white',
  '#ea580c': 'bg-orange-600 text-white',
  '#d97706': 'bg-amber-600 text-white',
  '#16a34a': 'bg-green-600 text-white',
  '#0d9488': 'bg-teal-600 text-white',
}

export const PAST_EVENT_COLOR_CLASSES: Record<FolderColor, string> = {
  '#2563eb': 'bg-blue-200 text-blue-900 dark:bg-blue-950 dark:text-blue-200',
  '#7c3aed': 'bg-violet-200 text-violet-900 dark:bg-violet-950 dark:text-violet-200',
  '#db2777': 'bg-pink-200 text-pink-900 dark:bg-pink-950 dark:text-pink-200',
  '#dc2626': 'bg-red-200 text-red-900 dark:bg-red-950 dark:text-red-200',
  '#ea580c': 'bg-orange-200 text-orange-900 dark:bg-orange-950 dark:text-orange-200',
  '#d97706': 'bg-amber-200 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  '#16a34a': 'bg-green-200 text-green-900 dark:bg-green-950 dark:text-green-200',
  '#0d9488': 'bg-teal-200 text-teal-900 dark:bg-teal-950 dark:text-teal-200',
}

function validInterval(value: unknown): number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 999 ? (value as number) : 1
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

function nthWeekdayDate(year: number, month: number, weekday: number, week: number): number {
  const dim = daysInMonth(year, month)
  if (week === -1) {
    const lastDow = new Date(Date.UTC(year, month, dim)).getUTCDay()
    return dim - ((lastDow - weekday + 7) % 7)
  }
  const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay()
  let date = 1 + ((weekday - firstDow + 7) % 7) + (week - 1) * 7
  while (date > dim) date -= 7
  return date
}

/** Nth-weekday of a monthly repeat, or null for a plain month-day repeat. */
function eventNthWeekday(event: CalendarEvent): { weekday: number, week: number } | null {
  const weekday = event.repeatWeekday
  const week = event.repeatWeek
  return event.repeat === 'monthly' && Number.isInteger(weekday) && (weekday as number) >= 0 && (weekday as number) <= 6
    && Number.isInteger(week) && (((week as number) >= 1 && (week as number) <= 5) || week === -1)
    ? { weekday: weekday as number, week: week as number }
    : null
}

function eventInterval(event: CalendarEvent): number {
  // A listed-days repeat steps day by day, so its interval is always 1.
  return event.repeat === 'weekdays' ? 1 : validInterval(event.repeatInterval)
}

/** One edited occurrence (RECURRENCE-ID): replaces the rule occurrence at `occurrenceMs`, or adds an extra one when no rule occurrence has that start. */
export type CalendarOccurrenceOverride = { occurrenceMs: number, startsAt: Date, endsAt: Date }

/** A guest's latest RSVP on one occurrence of an organized series. */
export type CalendarOccurrenceResponse = { occurrenceMs: number, guest: string, status: string }

/** Overrides as they arrive from GET /api/calendar/events (Dates serialize to ISO strings). */
export type CalendarOverridesInput = Record<string, Array<{ occurrenceMs: number, startsAt: string | Date, endsAt: string | Date }>>

/** Converts the additive `overrides` map of the events list response into expander input. */
export function toCalendarOverrides(input?: CalendarOverridesInput | null): Map<string, CalendarOccurrenceOverride[]> | undefined {
  if (!input || typeof input !== 'object') return undefined
  const map = new Map<string, CalendarOccurrenceOverride[]>()
  for (const [id, list] of Object.entries(input)) {
    if (!Array.isArray(list)) continue
    const parsed: CalendarOccurrenceOverride[] = []
    for (const item of list) {
      if (!item || !Number.isSafeInteger(item.occurrenceMs)) continue
      const startsAt = new Date(item.startsAt)
      const endsAt = new Date(item.endsAt)
      if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) continue
      parsed.push({ occurrenceMs: item.occurrenceMs, startsAt, endsAt })
    }
    if (parsed.length) map.set(id, parsed)
  }
  return map.size ? map : undefined
}

function recurringStart(first: Date, repeat: CalendarRepeat, index: number, timeZone: string, anchorDay?: number | null, nth?: { weekday: number, week: number } | null, interval = 1): Date {
  if (index === 0) return new Date(first)
  const fields = zonedDateFields(first, timeZone)
  if (repeat === 'monthly') {
    if (nth) {
      fields.setUTCDate(1)
      fields.setUTCMonth(fields.getUTCMonth() + index * interval)
      fields.setUTCDate(nthWeekdayDate(fields.getUTCFullYear(), fields.getUTCMonth(), nth.weekday, nth.week))
    } else {
      const day = anchorDay ?? fields.getUTCDate()
      fields.setUTCDate(1)
      fields.setUTCMonth(fields.getUTCMonth() + index * interval)
      const lastDay = daysInMonth(fields.getUTCFullYear(), fields.getUTCMonth())
      fields.setUTCDate(Math.min(day, lastDay))
    }
  } else if (repeat === 'yearly') {
    const day = fields.getUTCDate()
    const month = fields.getUTCMonth()
    fields.setUTCDate(1)
    fields.setUTCFullYear(fields.getUTCFullYear() + index * interval)
    fields.setUTCMonth(month)
    // February 29 clamps to February 28 outside leap years, like the monthly month-end clamp.
    fields.setUTCDate(Math.min(day, daysInMonth(fields.getUTCFullYear(), month)))
  } else {
    fields.setUTCDate(fields.getUTCDate() + index * interval * (repeat === 'weekly' ? 7 : 1))
  }
  return dateFromZonedFields(fields, timeZone)
}

/** Pending invitations read as outlined, not filled, so they are not mistaken for confirmed events. */
export const PENDING_EVENT_CLASSES = 'border-2 border-dashed border-primary bg-default text-primary'

/**
 * (fork) An all-day event: shown above the hour grid rather than on it. Before its migration is applied
 * the server sends the string "all_day" for the field, so only 1 counts.
 */
export function isAllDay(event: Pick<CalendarEvent, 'allDay'>): boolean {
  return event.allDay === 1 || event.allDay === true
}

/** The days an event covers, as date keys: its last day is the one before it ends. */
export function eventDayKeys(event: Pick<CalendarEvent, 'startsAt' | 'endsAt'>): { first: string, last: string } {
  const start = new Date(event.startsAt)
  const end = new Date(Math.max(start.getTime(), new Date(event.endsAt).getTime() - 1))
  return { first: dateKey(start), last: dateKey(end) }
}

/** "Thu 19 Nov", or "Thu 19 – Sat 21 Nov" across days, for all-day events. */
export function formatAllDayRange(event: Pick<CalendarEvent, 'startsAt' | 'endsAt'>): string {
  const { first, last } = eventDayKeys(event)
  const start = new Date(event.startsAt)
  if (first === last) return formatUserDate(start, { weekday: 'short', day: 'numeric', month: 'short' })
  const end = new Date(new Date(event.endsAt).getTime() - 1)
  return new Intl.DateTimeFormat(getDisplayLocale(), { weekday: 'short', day: 'numeric', month: 'short', timeZone: getUserTimeZone() }).formatRange(start, end)
}

export function isPendingInvite(event: { responseStatus?: string | null, inviteMessageId?: string | null }): boolean {
  return event.responseStatus === 'needs-action' && !!event.inviteMessageId
}

export function calendarTimeZone(_event?: CalendarEvent | null): string {
  return getUserTimeZone()
}

export function calendarAnchorDay(event: CalendarEvent | null, value: Date): number {
  return zonedDateFields(value, calendarTimeZone(event)).getUTCDate()
}

function recurrenceStartIndex(first: Date, repeat: CalendarRepeat, after: Date, timeZone: string, interval = 1): number {
  const start = zonedDateFields(first, timeZone)
  const end = zonedDateFields(after, timeZone)
  if (repeat === 'monthly') return Math.max(0, Math.floor(((end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth() - 1) / interval))
  if (repeat === 'yearly') return Math.max(0, Math.floor((end.getUTCFullYear() - start.getUTCFullYear() - 1) / interval))
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / (86_400_000 * (repeat === 'weekly' ? 7 : 1) * interval)) - 1)
}

export function expandCalendarEvents(events: CalendarEvent[], rangeStart: Date, rangeEnd: Date, overrides?: Map<string, CalendarOccurrenceOverride[]>): CalendarEvent[] {
  const occurrences: CalendarEvent[] = []
  for (const event of events) {
    const first = new Date(event.startsAt)
    const duration = new Date(event.endsAt).getTime() - first.getTime()
    if (event.repeat === 'none') {
      if (first < rangeEnd && first.getTime() + duration > rangeStart.getTime()) occurrences.push(event)
      continue
    }
    const until = event.repeatUntil ? new Date(event.repeatUntil).getTime() : Infinity
    const repeatDays = parseCalendarRepeatDays(event.repeatDays)
    const excluded = new Set(parseExcludedOccurrences(event.excludedOccurrences))
    const timeZone = calendarTimeZone(event)
    const interval = eventInterval(event)
    const nth = eventNthWeekday(event)
    const byMs = new Map((overrides?.get(event.id) ?? []).map(override => [override.occurrenceMs, override]))
    const ruleMs = new Set<number>()
    const firstIndex = recurrenceStartIndex(first, event.repeat, new Date(rangeStart.getTime() - duration), timeZone, interval)
    for (let index = firstIndex; index < firstIndex + 20_000; index++) {
      const startsAt = recurringStart(first, event.repeat, index, timeZone, event.repeatAnchorDay, nth, interval)
      if (startsAt >= rangeEnd || startsAt.getTime() >= until) break
      ruleMs.add(startsAt.getTime())
      if (excluded.has(startsAt.getTime()) || (event.repeat === 'weekdays' && !repeatDays.includes(zonedDateFields(startsAt, timeZone).getUTCDay()))) continue
      const endsAt = new Date(startsAt.getTime() + duration)
      if (endsAt > rangeStart) {
        const override = byMs.get(startsAt.getTime())
        occurrences.push(override
          ? { ...event, id: `${event.id}@${startsAt.getTime()}`, seriesStartsAt: event.startsAt, startsAt: override.startsAt.toISOString(), endsAt: override.endsAt.toISOString() }
          : { ...event, id: `${event.id}@${startsAt.getTime()}`, seriesStartsAt: event.startsAt, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() })
      }
    }
    // Overrides on no rule occurrence (RDATEs) are extra occurrences, unless excluded or outside the range.
    for (const override of byMs.values()) {
      if (ruleMs.has(override.occurrenceMs) || excluded.has(override.occurrenceMs)) continue
      if (override.endsAt <= rangeStart || override.startsAt >= rangeEnd) continue
      occurrences.push({ ...event, id: `${event.id}@${override.occurrenceMs}`, seriesStartsAt: event.startsAt, startsAt: override.startsAt.toISOString(), endsAt: override.endsAt.toISOString() })
    }
  }
  return occurrences.sort((a, b) => a.startsAt.localeCompare(b.startsAt))
}

export function nextCalendarOccurrence(event: CalendarEvent, after: Date, overrides?: CalendarOccurrenceOverride[]): Date | null {
  const first = new Date(event.seriesStartsAt ?? event.startsAt)
  const until = event.repeatUntil ? new Date(event.repeatUntil).getTime() : Infinity
  const repeatDays = parseCalendarRepeatDays(event.repeatDays)
  const excluded = new Set(parseExcludedOccurrences(event.excludedOccurrences))
  const timeZone = calendarTimeZone(event)
  const interval = eventInterval(event)
  const nth = eventNthWeekday(event)
  const byMs = new Map((overrides ?? []).map(override => [override.occurrenceMs, override]))
  const firstIndex = recurrenceStartIndex(first, event.repeat, after, timeZone, interval)
  let next: Date | null = null
  const ruleMs = new Set<number>()
  for (let index = firstIndex; index < firstIndex + 20_000; index++) {
    const startsAt = recurringStart(first, event.repeat, index, timeZone, event.repeatAnchorDay, nth, interval)
    if (startsAt.getTime() >= until) break
    ruleMs.add(startsAt.getTime())
    if (excluded.has(startsAt.getTime()) || (event.repeat === 'weekdays' && !repeatDays.includes(zonedDateFields(startsAt, timeZone).getUTCDay()))) continue
    const effective = byMs.get(startsAt.getTime())?.startsAt ?? startsAt
    if (effective < after) continue
    next = effective
    break
  }
  // An extra occurrence (RDATE) can be earlier than the next rule occurrence.
  for (const override of byMs.values()) {
    if (ruleMs.has(override.occurrenceMs) || excluded.has(override.occurrenceMs) || override.startsAt < after) continue
    if (!next || override.startsAt < next) next = override.startsAt
  }
  return next
}

export function rescheduleCalendarOccurrence(event: CalendarEvent, startsAt: Date, endsAt: Date, effectiveFrom: Date, overrides?: CalendarOccurrenceOverride[]): CalendarEventTimes | null {
  const timeZone = calendarTimeZone(event)
  const shift = zonedDateFields(startsAt, timeZone).getTime() - zonedDateFields(new Date(event.startsAt), timeZone).getTime()
  const threshold = dateFromZonedFields(new Date(zonedDateFields(effectiveFrom, timeZone).getTime() - shift), timeZone)
  let next = nextCalendarOccurrence(event, threshold, overrides)
  while (next) {
    const savedStart = shift === 0 ? next : dateFromZonedFields(new Date(zonedDateFields(next, timeZone).getTime() + shift), timeZone)
    if (savedStart >= effectiveFrom) return { startsAt: savedStart, endsAt: new Date(savedStart.getTime() + endsAt.getTime() - startsAt.getTime()) }
    next = nextCalendarOccurrence(event, new Date(next.getTime() + 1), overrides)
  }
  return null
}

export function startOfDay(value: Date): Date {
  const fields = zonedDateFields(value, getUserTimeZone())
  fields.setUTCHours(0, 0, 0, 0)
  return dateFromZonedFields(fields, getUserTimeZone())
}

export function addDays(value: Date, days: number): Date {
  const fields = zonedDateFields(value, getUserTimeZone())
  fields.setUTCDate(fields.getUTCDate() + days)
  fields.setUTCHours(0, 0, 0, 0)
  return dateFromZonedFields(fields, getUserTimeZone())
}

export function addMonths(value: Date, months: number): Date {
  const fields = zonedDateFields(value, getUserTimeZone())
  fields.setUTCDate(1)
  fields.setUTCMonth(fields.getUTCMonth() + months)
  fields.setUTCHours(0, 0, 0, 0)
  return dateFromZonedFields(fields, getUserTimeZone())
}

export function startOfMonth(value: Date): Date {
  return addMonths(value, 0)
}

export function defaultCalendarStart(day: Date): Date {
  const hour = Math.min(Math.max(zonedDateFields(new Date(), getUserTimeZone()).getUTCHours() + 1, CALENDAR_START_HOUR), CALENDAR_END_HOUR - 1)
  const fields = zonedDateFields(day, getUserTimeZone())
  fields.setUTCHours(hour, 0, 0, 0)
  return dateFromZonedFields(fields, getUserTimeZone())
}

// Regions whose weeks start on Sunday, for browsers without Intl.Locale week info (Firefox).
const SUNDAY_FIRST_REGIONS = new Set(['US', 'CA', 'MX', 'BR', 'JP', 'KR', 'TW', 'HK', 'PH', 'IL', 'IN', 'ZA', 'AU', 'SA', 'PE', 'CO', 'AR', 'GT', 'VE', 'PR'])

/** The weekday (0 = Sunday) a week starts on in the reader's region: Monday in Britain, Sunday in the US. */
export function weekStartDay(locale: string | undefined = getDisplayLocale() ?? (typeof navigator === 'undefined' ? undefined : navigator.language)): number {
  if (!locale) return 1
  try {
    const value = new Intl.Locale(locale) as Intl.Locale & { getWeekInfo?: () => { firstDay: number }, weekInfo?: { firstDay: number } }
    const info = value.getWeekInfo?.() ?? value.weekInfo
    if (info) return info.firstDay % 7
    const region = value.maximize().region
    return region && SUNDAY_FIRST_REGIONS.has(region) ? 0 : 1
  } catch {
    return 1
  }
}

/** Weekday numbers (0 = Sunday) in the order the reader's week runs. */
export function orderedWeekdays(firstDay = weekStartDay()): number[] {
  return Array.from({ length: 7 }, (_, index) => (firstDay + index) % 7)
}

function daysIntoWeek(value: Date, firstDay: number): number {
  return (zonedDateFields(value, getUserTimeZone()).getUTCDay() - firstDay + 7) % 7
}

export function monthGridDates(month: Date, firstDay = weekStartDay()): Date[] {
  const first = startOfMonth(month)
  const gridStart = addDays(first, -daysIntoWeek(first, firstDay))
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index))
}

export function startOfWeek(value: Date, firstDay = weekStartDay()): Date {
  return addDays(startOfDay(value), -daysIntoWeek(value, firstDay))
}

export function dateKey(value: Date): string {
  return zonedDateFields(value, getUserTimeZone()).toISOString().slice(0, 10)
}

export function formatLocalDateTime(value: Date): string {
  return formatUserDateTimeLocal(value)
}

export function eventEndAfterMinutes(start: string, minutes: number): string {
  const startDate = parseUserDateTimeLocal(start)
  if (!startDate) return ''
  return formatLocalDateTime(new Date(startDate.getTime() + minutes * 60_000))
}

export function currentTimePosition(value: Date): number {
  const fields = zonedDateFields(value, getUserTimeZone())
  return ((fields.getUTCHours() - CALENDAR_START_HOUR) * 60 + fields.getUTCMinutes() + fields.getUTCSeconds() / 60) * CALENDAR_HOUR_HEIGHT / 60
}

function usesTwelveHourClock(): boolean {
  return new Intl.DateTimeFormat(getDisplayLocale(), { hour: 'numeric' }).resolvedOptions().hour12 === true
}

/** Hour labels down the grid: "09:00" on a 24-hour clock, "9 AM" on a 12-hour one. */
export function formatHour(hour: number): string {
  return new Date(2026, 0, 1, hour).toLocaleTimeString(getDisplayLocale(), usesTwelveHourClock() ? { hour: 'numeric' } : { hour: '2-digit', minute: '2-digit' })
}

/** "09:00" or "9:00 AM": always with minutes, so the two ends of a range read alike. */
export function formatEventTime(value: Date): string {
  return formatUserDate(value, { hour: usesTwelveHourClock() ? 'numeric' : '2-digit', minute: '2-digit' })
}

export function formatEventRange(event: Pick<CalendarEvent, 'startsAt' | 'endsAt'>): string {
  return `${formatEventTime(new Date(event.startsAt))} – ${formatEventTime(new Date(event.endsAt))}`
}

export function groupUpcomingEvents(events: CalendarEvent[], today: Date, t: Translator = defaultTranslator): EventGroup[] {
  const todayStart = startOfDay(today)
  const tomorrowStart = addDays(todayStart, 1)
  const groups: EventGroup[] = []
  for (const event of events) {
    const eventDate = startOfDay(new Date(event.startsAt))
    if (eventDate < todayStart) continue
    const key = dateKey(eventDate)
    const label = key === dateKey(todayStart)
      ? t('calendar.today')
      : key === dateKey(tomorrowStart)
        ? t('calendar.tomorrow')
        : formatUserDate(eventDate, { weekday: 'short', day: 'numeric', month: 'short', year: key.slice(0, 4) === dateKey(todayStart).slice(0, 4) ? undefined : 'numeric' })
    const lastGroup = groups[groups.length - 1]
    if (lastGroup?.key === key) lastGroup.events.push(event)
    else groups.push({ key, label, events: [event] })
  }
  return groups
}

export function takeUpcomingGroups(groups: EventGroup[], count: number): EventGroup[] {
  const visible: EventGroup[] = []
  let remaining = count
  for (const group of groups) {
    if (remaining <= 0) break
    const events = group.events.slice(0, remaining)
    if (events.length) visible.push({ ...group, events })
    remaining -= events.length
  }
  return visible
}

export function eventPosition(event: Pick<CalendarEvent, 'startsAt' | 'endsAt'>, day: Date): { top: number, height: number } | null {
  const start = new Date(event.startsAt)
  const end = new Date(event.endsAt)
  const dayStart = startOfDay(day)
  const dayEnd = addDays(dayStart, 1)
  if (start >= dayEnd || end <= dayStart) return null
  const startFields = zonedDateFields(start, getUserTimeZone())
  const endFields = zonedDateFields(end, getUserTimeZone())
  const startMinutes = start <= dayStart ? 0 : startFields.getUTCHours() * 60 + startFields.getUTCMinutes() + startFields.getUTCSeconds() / 60
  const endMinutes = end >= dayEnd ? 24 * 60 : endFields.getUTCHours() * 60 + endFields.getUTCMinutes() + endFields.getUTCSeconds() / 60
  // A repeated hour can put the end above the start on this wall-clock grid.
  const heightMinutes = endMinutes > startMinutes ? endMinutes - startMinutes : 15
  return {
    top: (startMinutes - CALENDAR_START_HOUR * 60) * CALENDAR_HOUR_HEIGHT / 60,
    height: heightMinutes * CALENDAR_HOUR_HEIGHT / 60,
  }
}

export function dropStartForPosition(day: Date, pixelsFromTop: number): Date {
  const minutes = Math.max(0, Math.min(24 * 60 - 15, Math.round(pixelsFromTop * 60 / CALENDAR_HOUR_HEIGHT / 15) * 15))
  const fields = zonedDateFields(startOfDay(day), getUserTimeZone())
  fields.setUTCMinutes(minutes)
  return dateFromZonedFields(fields, getUserTimeZone())
}

/** An event's times moved by whole days, keeping its wall-clock start and its length. */
export function shiftEventByDays(event: Pick<CalendarEvent, 'startsAt' | 'endsAt'>, days: number): CalendarEventTimes {
  const start = new Date(event.startsAt)
  const fields = zonedDateFields(start, getUserTimeZone())
  fields.setUTCDate(fields.getUTCDate() + days)
  const startsAt = dateFromZonedFields(fields, getUserTimeZone())
  return { startsAt, endsAt: new Date(startsAt.getTime() + new Date(event.endsAt).getTime() - start.getTime()) }
}

/** The 15-minute slot (minutes after midnight) that a point on the hour grid falls in. */
export function slotMinutesForPosition(pixelsFromTop: number): number {
  return Math.max(0, Math.min(24 * 60 - 15, Math.floor(pixelsFromTop * 60 / CALENDAR_HOUR_HEIGHT / 15) * 15))
}

/**
 * Times covered by a drag across the hour grid, from the slot the pointer went down in to the slot it
 * is over now, in either direction. Both slots are included, so a press without a move covers one slot.
 */
export function slotSelectionTimes(day: Date, anchorMinutes: number, currentMinutes: number): CalendarEventTimes {
  const fields = zonedDateFields(startOfDay(day), getUserTimeZone())
  const at = (minutes: number) => {
    const value = new Date(fields)
    value.setUTCMinutes(minutes)
    return dateFromZonedFields(value, getUserTimeZone())
  }
  return { startsAt: at(Math.min(anchorMinutes, currentMinutes)), endsAt: at(Math.max(anchorMinutes, currentMinutes) + 15) }
}

export function resizeEventTimes(event: CalendarEvent, day: Date, edge: EventResizeEdge, pixelsFromTop: number): CalendarEventTimes {
  const minimum = edge === 'start' ? 0 : 15
  const maximum = edge === 'start' ? 24 * 60 - 15 : 24 * 60
  const minutes = Math.max(minimum, Math.min(maximum, Math.round(pixelsFromTop * 60 / CALENDAR_HOUR_HEIGHT / 15) * 15))
  const fields = zonedDateFields(startOfDay(day), getUserTimeZone())
  fields.setUTCMinutes(minutes)
  const boundary = dateFromZonedFields(fields, getUserTimeZone())
  const startsAt = new Date(event.startsAt)
  const endsAt = new Date(event.endsAt)
  if (edge === 'start') return { startsAt: new Date(Math.min(boundary.getTime(), endsAt.getTime() - 15 * 60_000)), endsAt }
  return { startsAt, endsAt: new Date(Math.max(boundary.getTime(), startsAt.getTime() + 15 * 60_000)) }
}

/** Upstream's mailbox provider keeps the selected mailbox id here; the calendar sends invitations from it. */
export const SELECTED_MAILBOX_STORAGE_KEY = 'selected-mailbox-id'

/**
 * Columns for a day's overlapping events. Events that overlap, directly or through a chain of
 * others, form a cluster with as many columns as it needs at once; each event takes the leftmost column that
 * is free when it starts. Input is each event's top and height on the grid, in any order.
 */
export function layoutOverlappingEvents(blocks: Array<{ top: number, height: number }>): Array<{ column: number, columns: number }> {
  const order = blocks.map((block, index) => ({ index, top: block.top, bottom: block.top + block.height }))
    .sort((a, b) => a.top - b.top || b.bottom - a.bottom)
  const result: Array<{ column: number, columns: number }> = blocks.map(() => ({ column: 0, columns: 1 }))
  let cluster: number[] = []
  let columnEnds: number[] = []
  let clusterBottom = -Infinity
  const close = () => {
    for (const index of cluster) result[index]!.columns = columnEnds.length
    cluster = []
    columnEnds = []
  }
  for (const item of order) {
    if (item.top >= clusterBottom) {
      close()
      clusterBottom = -Infinity
    }
    let column = columnEnds.findIndex(end => end <= item.top)
    if (column === -1) column = columnEnds.push(item.bottom) - 1
    else columnEnds[column] = item.bottom
    result[item.index]!.column = column
    cluster.push(item.index)
    clusterBottom = Math.max(clusterBottom, item.bottom)
  }
  close()
  return result
}
