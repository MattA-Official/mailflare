// Shell helpers: hotkey matching (ported from legacy/tests/hotkey-sequences.test.mjs), realtime
// payload parsing and the settings sidebar filter.
import { describe, expect, it, vi } from 'vitest'
import type { ShortcutDefinition } from '../../../app/types/shortcuts'
import { createHotkeyHandler, findSequenceMatch, formatShortcutKeys, hasCommandModifier, isModifierKey } from '../../../app/utils/shortcuts/hotkeys'
import { getReconnectDelay, getRealtimeWebSocketUrl, parseNewMessageEvent } from '../../../app/utils/realtime/client'
import { visibleSettingsNavSections } from '../../../app/utils/settings/nav'

const shortcut = (key: string, extra: Partial<ShortcutDefinition> = {}): ShortcutDefinition => ({ key, label: key, category: 'General', action: vi.fn(), ...extra })

describe('hotkey sequences', () => {
  const shortcuts = [shortcut('g i'), shortcut('g !'), shortcut('e')]

  it('matches a sequence when it ends the buffer', () => {
    expect(findSequenceMatch(['g', 'i'], shortcuts)).toBe(shortcuts[0])
    expect(findSequenceMatch(['j', 'g', 'i'], shortcuts)).toBe(shortcuts[0])
    expect(findSequenceMatch(['g', '!'], shortcuts)).toBe(shortcuts[1])
  })

  it('matches a lone key only when it is the whole buffer', () => {
    expect(findSequenceMatch(['e'], shortcuts)).toBe(shortcuts[2])
    expect(findSequenceMatch(['j', 'e'], shortcuts)).toBeUndefined()
    expect(findSequenceMatch([], shortcuts)).toBeUndefined()
  })

  it('treats modifier keys as modifiers', () => {
    for (const key of ['shift', 'control', 'alt', 'meta']) expect(isModifierKey(key)).toBe(true)
    expect(isModifierKey('g')).toBe(false)
  })

  it('leaves command-modifier combinations to the browser', () => {
    expect(hasCommandModifier({ metaKey: true, ctrlKey: false, altKey: false })).toBe(true)
    expect(hasCommandModifier({ metaKey: false, ctrlKey: true, altKey: false })).toBe(true)
    expect(hasCommandModifier({ metaKey: false, ctrlKey: false, altKey: true })).toBe(true)
    expect(hasCommandModifier({ metaKey: false, ctrlKey: false, altKey: false })).toBe(false)
  })
})

describe('hotkey handler', () => {
  const key = (value: string, init: Partial<KeyboardEvent> = {}) => ({
    key: value, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, target: null, preventDefault: vi.fn(), ...init,
  }) as unknown as KeyboardEvent

  it('runs sequences, single keys and Cmd+K, but not Cmd+C', () => {
    const goInbox = shortcut('g i')
    const compose = shortcut('c')
    const palette = shortcut('k', { modifiers: ['meta', 'ctrl'] })
    const { handle, reset } = createHotkeyHandler(() => [goInbox, compose, palette])
    handle(key('g'))
    handle(key('i'))
    expect(goInbox.action).toHaveBeenCalledOnce()
    handle(key('c', { metaKey: true }))
    expect(compose.action).not.toHaveBeenCalled()
    handle(key('c'))
    expect(compose.action).toHaveBeenCalledOnce()
    handle(key('k', { ctrlKey: true }))
    expect(palette.action).toHaveBeenCalledOnce()
    reset()
  })

  it('formats key caps for the cheat sheet', () => {
    expect(formatShortcutKeys({ key: 'k', modifiers: ['meta', 'ctrl'] }, 'Ctrl')).toEqual(['⌘', 'Ctrl', 'K'])
    expect(formatShortcutKeys({ key: 'g i' }, 'Ctrl')).toEqual(['G', 'I'])
  })
})

describe('realtime', () => {
  it('parses new-message events and rejects anything else', () => {
    expect(parseNewMessageEvent(JSON.stringify({ type: 'new_message', messageId: 'm', mailboxId: 'b', from: 'a@b.c', subject: 'Hi' })))
      .toEqual({ type: 'new_message', messageId: 'm', mailboxId: 'b', from: 'a@b.c', fromName: null, subject: 'Hi' })
    expect(parseNewMessageEvent(JSON.stringify({ type: 'revision', revision: '1' }))).toBeNull()
    expect(parseNewMessageEvent('not json')).toBeNull()
  })

  it('backs off exponentially up to 30 seconds', () => {
    expect(getReconnectDelay(0)).toBe(1000)
    expect(getReconnectDelay(3)).toBe(8000)
    expect(getReconnectDelay(10)).toBe(30000)
  })

  it('uses wss on https', () => {
    expect(getRealtimeWebSocketUrl({ protocol: 'https:', host: 'mail.example.test' })).toBe('wss://mail.example.test/api/realtime')
    expect(getRealtimeWebSocketUrl({ protocol: 'http:', host: 'localhost:8787' })).toBe('ws://localhost:8787/api/realtime')
  })
})

describe('settings sidebar', () => {
  it('hides mailbox settings from users who cannot manage mailboxes', () => {
    const hrefs = (canManage: boolean) => visibleSettingsNavSections(canManage).flatMap(section => section.items.map(item => item.href))
    expect(hrefs(false)).not.toContain('/settings/mailboxes')
    expect(hrefs(true)).toContain('/settings/mailboxes')
  })
})

describe('sidebar reordering', async () => {
  const { moveItem, resolveLayout } = await import('~/utils/nav/reorder')
  it('keeps saved order, drops unknown ids and appends new ones', () => {
    expect(resolveLayout({ main: ['a', 'b', 'c'], more: ['d'] }, { main: ['c', 'x', 'a'], more: ['b', 'c'] }))
      .toEqual({ main: ['c', 'a'], more: ['b', 'd'] })
  })
  it('moves an item between lists', () => {
    expect(moveItem({ main: ['a', 'b'], more: ['c'] }, 'a', 'more', 'c')).toEqual({ main: ['b'], more: ['a', 'c'] })
    expect(moveItem({ main: ['a', 'b'], more: ['c'] }, 'c', 'main', null)).toEqual({ main: ['a', 'b', 'c'], more: [] })
  })
})
