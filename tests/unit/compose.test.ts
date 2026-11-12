// Ported from legacy/tests/send-notice.test.mjs, schedule-past.test.mjs and sheet-viewport.test.mjs
// (the compose halves; the send-view and /api/send halves belong to their own areas).
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveSendNotice, splitSendTemplate } from '../../app/utils/compose/send-notice-utils'
import { isPastSchedule } from '../../app/utils/compose/schedule-send-utils'
import { getSheetViewportStyle } from '../../app/utils/compose/sheet-viewport-utils'
import { isValidRecipient, parseRecipientEntries, getRecipientLabel } from '../../app/utils/compose/recipient-utils'
import { joinQuotedHtml, splitQuotedHtml, textToHtml, wrapQuotedHtml } from '../../app/utils/compose/rich-text-utils'

const root = join(import.meta.dirname, '..', '..')

describe('send notices', () => {
  const now = Date.parse('2026-10-28T12:00:00.000Z')
  const at = (offsetMs: number) => new Date(now + offsetMs).toISOString()

  it('counts an undo window down from the duration the server reports', () => {
    expect(resolveSendNotice({ messageId: 'msg_1', scheduled: true, undoSeconds: 15, undoRemainingMs: 14_200 }, now))
      .toEqual({ kind: 'undo', messageId: 'msg_1', endAt: now + 14_200, durationMs: 14_200 })
  })

  it('falls back to the configured undo window', () => {
    expect(resolveSendNotice({ messageId: 'msg_1', scheduled: true, undoSeconds: 10 }, now))
      .toEqual({ kind: 'undo', messageId: 'msg_1', endAt: now + 10_000, durationMs: 10_000 })
  })

  it('waits for the queue when no time is left', () => {
    for (const undoRemainingMs of [0, -1]) {
      expect(resolveSendNotice({ messageId: 'msg_1', scheduled: true, undoSeconds: 5, undoRemainingMs }, now))
        .toEqual({ kind: 'sending', messageId: 'msg_1' })
    }
  })

  it('keeps a schedule cancellable with or without its time', () => {
    expect(resolveSendNotice({ messageId: 'msg_2', scheduled: true, scheduledAt: at(86_400_000) }, now))
      .toEqual({ kind: 'scheduled', messageId: 'msg_2', scheduledAt: at(86_400_000) })
    expect(resolveSendNotice({ messageId: 'msg_2', scheduled: true }, now))
      .toEqual({ kind: 'scheduled', messageId: 'msg_2', scheduledAt: null })
  })

  it('has no action for an immediate send', () => {
    expect(resolveSendNotice({ messageId: 'msg_3' }, now)).toEqual({ kind: 'sent' })
    expect(resolveSendNotice({}, now)).toEqual({ kind: 'sent' })
  })

  it('splits the subject from the ticking seconds', () => {
    const parts = splitSendTemplate('Sending “{subject}” in {seconds}s', true)
    expect(parts.before).toBe('Sending “')
    expect(parts.after).toBe('” in ')
    expect(parts.ticker?.(9)).toBe('9s')
    expect(splitSendTemplate('Sent “{subject}”', false)).toEqual({ before: 'Sent “', after: '”' })
  })

  it('every locale preserves the linked subject and countdown placeholders', () => {
    const keys = ['compose.sendingIn', 'compose.sendingSubject', 'compose.sentSubject', 'compose.undoSend', 'compose.sendNow']
    const en = JSON.parse(readFileSync(join(root, 'server/lib/i18n/en.json'), 'utf8'))
    const placeholders = (value: string) => [...value.matchAll(/\{\w+\}/g)].map(([token]) => token).sort()
    for (const file of readdirSync(join(root, 'public/locales'))) {
      if (!file.endsWith('.json')) continue
      const catalog = JSON.parse(readFileSync(join(root, 'public/locales', file), 'utf8'))
      for (const key of keys) {
        expect(catalog[key]?.trim(), `${file}: ${key}`).toBeTruthy()
        expect(placeholders(catalog[key]), `${file}: ${key}`).toEqual(placeholders(en[key]))
      }
      const template: string = catalog['compose.sendingIn']
      const parts = splitSendTemplate(template, true)
      expect(parts.before + 'SUBJECT' + parts.after + parts.ticker!(7)).toBe(template.replace('{subject}', 'SUBJECT').replace('{seconds}', '7'))
    }
  })
})

describe('schedule picker', () => {
  const now = new Date('2026-10-13T14:05:42.000Z')
  it('allows the current minute and anything later', () => {
    expect(isPastSchedule(new Date('2026-10-13T14:05:00.000Z'), now)).toBe(false)
    expect(isPastSchedule(new Date('2026-10-14T08:00:00.000Z'), now)).toBe(false)
  })
  it('rejects anything before the current minute', () => {
    expect(isPastSchedule(new Date('2026-10-13T14:04:00.000Z'), now)).toBe(true)
  })
})

describe('phone sheet viewport', () => {
  it('fills the visual viewport without a keyboard', () => {
    expect(getSheetViewportStyle(800, 780, 0)).toEqual({ height: '780px', bottom: '20px', padding: 'max(env(safe-area-inset-bottom), 1rem)' })
  })
  it('shrinks above the keyboard and drops safe-area padding', () => {
    expect(getSheetViewportStyle(800, 450, 0)).toEqual({ height: '450px', bottom: '350px', padding: '0.5rem' })
  })
})

describe('recipients', () => {
  it('splits, deduplicates and validates', () => {
    expect(parseRecipientEntries('a@example.com, Bob <b@example.com>; a@example.com', ['B@example.com'])).toEqual(['a@example.com'])
    expect(isValidRecipient('Bob <b@example.com>')).toBe(true)
    expect(isValidRecipient('nope')).toBe(false)
    expect(getRecipientLabel('Bob <b@example.com>')).toBe('Bob')
  })
})

describe('quoted html', () => {
  it('round-trips the folded quote', () => {
    const joined = joinQuotedHtml('<div>Hi</div>', '<p>old</p>')
    expect(joined).toBe(`<div>Hi</div>${wrapQuotedHtml('<p>old</p>')}`)
    expect(splitQuotedHtml(joined)).toEqual({ body: '<div>Hi</div>', quoted: '<p>old</p>' })
    expect(textToHtml('a <b>\nc')).toBe('<div>a &lt;b&gt;<br>c</div>')
  })
})
