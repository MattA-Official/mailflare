import { describe, expect, it } from 'vitest'
import { createTranslator, resolveLocale } from '../../server/lib/i18n/utils'

describe('translator', () => {
  it('interpolates variables', () => {
    const t = createTranslator('en')
    expect(t('account.inboxes', { count: 3 })).toBe('Inboxes (3)')
  })

  it('falls back to the default locale for unknown values', () => {
    expect(resolveLocale('xx')).toBe('en')
    expect(resolveLocale('de')).toBe('de')
  })
})
