// Ported from legacy/src/components/compose/schedule-send-utils.ts and
// legacy/src/components/messages/scheduled-send-utils.ts (formatScheduledSendTime).
import type { TranslationKey } from '#lib/i18n/types'
import type { Translator } from '#lib/i18n/utils'
import { dateFromZonedFields, formatUserDate, formatUserDateTimeLocal, getUserTimeZone, parseUserDateTimeLocal, zonedDateFields } from '#lib/time/utils'

export interface ScheduleSendOption {
  labelKey: TranslationKey
  value: Date
}

const DAY_MS = 24 * 60 * 60 * 1000

function atTime(date: Date, hours: number): Date {
  const fields = new Date(date)
  fields.setUTCHours(hours, 0, 0, 0)
  return dateFromZonedFields(fields, getUserTimeZone())
}

export function getScheduleSendOptions(now = new Date()): ScheduleSendOption[] {
  const laterToday = new Date(now.getTime() + 3 * 60 * 60 * 1000)
  const today = zonedDateFields(now, getUserTimeZone())
  const tomorrow = new Date(today)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  const monday = new Date(today)
  const daysUntilMonday = ((8 - monday.getUTCDay()) % 7) || 7
  monday.setUTCDate(monday.getUTCDate() + daysUntilMonday)

  return [
    { labelKey: zonedDateFields(laterToday, getUserTimeZone()).toISOString().slice(0, 10) === today.toISOString().slice(0, 10) ? 'schedule.laterToday' : 'schedule.in3Hours', value: laterToday },
    { labelKey: 'schedule.tomorrowMorning', value: atTime(tomorrow, 8) },
    { labelKey: 'schedule.mondayMorning', value: atTime(monday, 8) },
  ]
}

export function formatScheduledSend(value: Date): string {
  return formatUserDate(value, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function formatDateTimeLocal(value: Date): string {
  return formatUserDateTimeLocal(value)
}

export function parseDateTimeLocal(value: string): Date | null {
  return parseUserDateTimeLocal(value)
}

export function isPastSchedule(value: Date, now = new Date()): boolean {
  return value.getTime() < now.getTime() - (now.getTime() % 60_000)
}

/** "Today at 9:00", "Tomorrow at 8:00", a weekday within a week, else a date. */
export function formatScheduledSendTime(value: Date | string, t: Translator, now = new Date()): string {
  const date = new Date(value)
  const zone = getUserTimeZone()
  const startOfDay = (input: Date) => {
    const fields = zonedDateFields(input, zone)
    fields.setUTCHours(0, 0, 0, 0)
    return fields.getTime()
  }
  const days = Math.round((startOfDay(date) - startOfDay(now)) / DAY_MS)
  const time = formatUserDate(date, { hour: 'numeric', minute: '2-digit' })
  if (days === 0) return t('schedule.todayAt', { time })
  if (days === 1) return t('schedule.tomorrowAt', { time })
  if (days >= 2 && days <= 7) return formatUserDate(date, { weekday: 'long', hour: 'numeric', minute: '2-digit' })
  const sameYear = zonedDateFields(date, zone).getUTCFullYear() === zonedDateFields(now, zone).getUTCFullYear()
  return formatUserDate(date, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }), hour: 'numeric', minute: '2-digit' })
}
