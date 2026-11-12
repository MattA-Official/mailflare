// Pure helpers behind the calendar, booking and public booking pages (app/utils/calendar).
import { describe, expect, it } from 'vitest'
import { dateKey, eventPosition, expandCalendarEvents, groupUpcomingEvents, resizeEventTimes, takeUpcomingGroups } from '../../app/utils/calendar/calendar'
import { bookingFormWithName, matchBookingHost, nextBookingTimeRange, parseBookingHostIds, visibleBookingEvents } from '../../app/utils/calendar/booking'
import { calendarDays, localDateIn, moveMonth, readBookingPageSelection } from '../../app/utils/calendar/public-booking'
import type { BookingEvent, CalendarEvent } from '../../app/types/calendar'

// Outside a browser getUserTimeZone() answers UTC, so the grid maths below is in UTC.
function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return { id: 'evt', title: 'Standup', description: '', startsAt: '2026-11-02T09:00:00.000Z', endsAt: '2026-11-02T09:30:00.000Z', location: '', attendees: '[]', color: '#2563eb', repeat: 'none', repeatDays: '[]', repeatAnchorDay: null, repeatUntil: null, excludedOccurrences: '[]', ...overrides }
}

describe('calendar grid', () => {
  it('expands a daily series into occurrences inside the range, skipping exclusions', () => {
    const excluded = Date.parse('2026-11-04T09:00:00.000Z')
    const occurrences = expandCalendarEvents([event({ repeat: 'daily', excludedOccurrences: JSON.stringify([excluded]) })], new Date('2026-11-03T00:00:00Z'), new Date('2026-11-06T00:00:00Z'))
    expect(occurrences.map(item => item.startsAt)).toEqual(['2026-11-03T09:00:00.000Z', '2026-11-05T09:00:00.000Z'])
    expect(occurrences[0]!.id).toBe(`evt@${Date.parse('2026-11-03T09:00:00.000Z')}`)
    expect(occurrences[0]!.seriesStartsAt).toBe('2026-11-02T09:00:00.000Z')
  })

  it('keeps a weekdays series to the chosen days', () => {
    const occurrences = expandCalendarEvents([event({ repeat: 'weekdays', repeatDays: '[1,3]' })], new Date('2026-11-02T00:00:00Z'), new Date('2026-11-09T00:00:00Z'))
    expect(occurrences.map(item => dateKey(new Date(item.startsAt)))).toEqual(['2026-11-02', '2026-11-04'])
  })

  it('positions an event on the hour grid and snaps resizes to 15 minutes', () => {
    expect(eventPosition(event(), new Date('2026-11-02T00:00:00Z'))).toEqual({ top: 9 * 36, height: 18 })
    expect(eventPosition(event(), new Date('2026-11-03T00:00:00Z'))).toBeNull()
    const resized = resizeEventTimes(event(), new Date('2026-11-02T00:00:00Z'), 'end', 10 * 36 + 2)
    expect(resized.endsAt.toISOString()).toBe('2026-11-02T10:00:00.000Z')
  })

  it('groups upcoming events by day and takes them in batches', () => {
    const t = ((key: string) => key) as Parameters<typeof groupUpcomingEvents>[2]
    const groups = groupUpcomingEvents([event(), event({ id: 'b' }), event({ id: 'c', startsAt: '2026-11-03T09:00:00.000Z', endsAt: '2026-11-03T10:00:00.000Z' })], new Date('2026-11-02T08:00:00Z'), t)
    expect(groups.map(group => [group.label, group.events.length])).toEqual([['calendar.today', 2], ['calendar.tomorrow', 1]])
    expect(takeUpcomingGroups(groups, 2).map(group => group.events.length)).toEqual([2])
  })
})

describe('booking helpers', () => {
  const hosts = [{ id: 'u1', name: 'Matt', email: 'matt@example.test' }, { id: 'u2', name: 'Mary', email: 'mary@example.test' }]

  it('matches hosts by email or unique name prefix', () => {
    expect(matchBookingHost(hosts, 'MARY@example.test').host?.id).toBe('u2')
    expect(matchBookingHost(hosts, 'mat').host?.id).toBe('u1')
    expect(matchBookingHost(hosts, 'ma').host).toBeNull()
  })

  it('suggests the next free time window', () => {
    expect(nextBookingTimeRange([{ startTime: '09:00', endTime: '17:00' }], 30)).toEqual({ startTime: '17:00', endTime: '18:00' })
    expect(nextBookingTimeRange([{ startTime: '09:00', endTime: '23:30' }], 30)).toEqual({ startTime: '00:00', endTime: '01:00' })
  })

  it('keeps the slug following the name until it is edited', () => {
    const form = bookingFormWithName({ name: '', slug: '' } as never, 'Intro call')
    expect(form.slug).toBe('intro-call')
    expect(bookingFormWithName({ ...form, slug: 'custom' }, 'Other').slug).toBe('custom')
  })

  it('puts the owner first among hosts', () => {
    expect(parseBookingHostIds('["u2","u1"]', 'u1')).toEqual(['u1', 'u2'])
    expect(parseBookingHostIds('nonsense', 'u1')).toEqual(['u1'])
  })

  it('offers the templates only until the user has their own events', () => {
    expect(visibleBookingEvents([], 'u1', 'UTC').map(item => item.slug)).toEqual(['30-minute-meeting', '15-minute-meeting'])
    expect(visibleBookingEvents([{ slug: 'mine' } as BookingEvent], 'u1', 'UTC')).toHaveLength(1)
  })
})

describe('public booking helpers', () => {
  it('lays out a Monday-first month', () => {
    const days = calendarDays('2026-11')
    expect(days.slice(0, 7)).toEqual(['', '', '', '', '', '', '2026-11-01'])
    expect(days.length % 7).toBe(0)
    expect(moveMonth('2026-12', 1)).toBe('2027-01')
  })

  it('reads only valid selections from the query string', () => {
    expect(readBookingPageSelection('?date=2026-02-30&slot=nope&timeZone=Mars/Base')).toEqual({ date: null, slotStartsAt: null, timeZone: null })
    expect(readBookingPageSelection('?date=2026-11-12&timeZone=Europe/London').date).toBe('2026-11-12')
  })

  it('finds the local date of a slot', () => {
    expect(localDateIn('2026-11-12T23:30:00Z', 'Asia/Tokyo')).toBe('2026-11-13')
  })
})
