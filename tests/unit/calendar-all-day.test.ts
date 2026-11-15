// (fork) All-day events, marked in calendar_event_all_day, a table whose migration may not be applied
// yet (server/lib/calendar/all-day.ts).
import { describe, expect, it } from 'vitest'
import { icsDate, isAllDayEvent, loadAllDayEventIds, setAllDayEvent } from '../../server/lib/calendar/all-day'

const missingTable = new Error('Failed query', { cause: new Error('D1_ERROR: no such table: calendar_event_all_day: SQLITE_ERROR') })

/** A query builder stand-in where every chain ends by throwing `error`. */
function failingDb(error: Error) {
  const chain: Record<string, unknown> = new Proxy({}, {
    get: (_target, key) => key === 'then' ? (_resolve: unknown, reject: (reason: unknown) => void) => reject(error) : () => chain,
  })
  return chain as never
}

describe('all-day events', () => {
  it('reads no all-day events before the migration', async () => {
    expect(await loadAllDayEventIds(failingDb(missingTable), 'usr_1')).toEqual(new Set())
    expect(await isAllDayEvent(failingDb(missingTable), 'evt_1')).toBe(false)
  })

  it('skips the mark before the migration and says so', async () => {
    expect(await setAllDayEvent(failingDb(missingTable), 'evt_1', true)).toBe(false)
  })

  it('does not swallow other errors', async () => {
    await expect(setAllDayEvent(failingDb(new Error('UNIQUE constraint failed')), 'evt_1', true)).rejects.toThrow('UNIQUE')
  })

  it('formats dates for VALUE=DATE in the event zone', () => {
    expect(icsDate(new Date('2026-11-19T00:00:00Z'), 'Europe/London')).toBe('20261119')
    expect(icsDate(new Date('2026-11-19T05:00:00Z'), 'America/New_York')).toBe('20261119')
  })
})
