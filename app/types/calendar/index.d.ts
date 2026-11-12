// Types for the calendar, booking and public booking pages. Ported from
// legacy/src/app/(calendar)/**/types.d.ts and legacy/src/app/book/**/types.d.ts.
import type { CalendarRepeat } from '#lib/calendar/types'
import type { BookingTimeRange } from '#lib/booking/types'

export interface CalendarEvent {
  id: string
  title: string
  description: string
  startsAt: string
  endsAt: string
  location: string
  attendees: string
  color: string
  repeat: CalendarRepeat
  repeatDays: string
  repeatAnchorDay: number | null
  repeatUntil: string | null
  excludedOccurrences: string
  reminderMinutes?: number | null
  timeZone?: string | null
  seriesStartsAt?: string
  /** Set on events created from an emailed invitation: needs-action (pending), tentative or accepted. */
  responseStatus?: string | null
  inviteMessageId?: string | null
  /** JSON map of guest address to accepted, tentative or declined. */
  attendeeResponses?: string | null
}

export type CalendarView = 'month' | 'week' | 'day'

export interface CalendarEventTimes { startsAt: Date, endsAt: Date }

export interface EventGroup {
  key: string
  label: string
  events: CalendarEvent[]
}

export interface EventDragPreview {
  eventId: string
  day: Date
  startsAt: Date
  endsAt: Date
}

export type EventResizeEdge = 'start' | 'end'

export interface EventResizeSession {
  event: CalendarEvent
  day: Date
  edge: EventResizeEdge
  columnTop: number
  pointerY: number
  moved: boolean
}

export interface BookingEvent {
  id: string
  userId: string
  name: string
  slug: string
  description: string
  color: string
  hostIds: string
  durationMinutes: number
  location: string
  weekdays: string
  startTime: string
  endTime: string
  timeRanges: string
  timeZone: string
  enabled: boolean
  isTemplate?: true
}

export interface BookingForm {
  name: string
  slug: string
  description: string
  color: string
  hostIds: string[]
  durationMinutes: number
  location: string
  weekdays: number[]
  startTime: string
  endTime: string
  timeRanges: BookingTimeRange[]
  timeZone: string
  enabled: boolean
}

export interface BookingHost { id: string, name: string, email: string, hasAvatar?: boolean }

export interface BookingHostMatch { host: BookingHost | null, error: string }

export type BookingEditorSection = 'event' | 'duration' | 'location' | 'availability' | 'host' | null

export interface PublicBookingEvent {
  id: string
  slug: string
  userId: string
  name: string
  description: string
  durationMinutes: number
  location: string
  weekdays: number[] | string
  startTime?: string
  endTime?: string
  timeZone: string
}

export interface BookingSlot { startsAt: string, endsAt: string, localDate: string, time: string }

export interface BookingPageSelection {
  date: string | null
  slotStartsAt: string | null
  timeZone: string | null
}

export interface CalendarMailbox {
  id: string
  localPart: string
  hostname: string
  isPrimary?: boolean
  senderAddresses?: string[]
}
