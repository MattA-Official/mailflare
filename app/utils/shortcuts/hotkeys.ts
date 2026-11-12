// Keyboard matching for the shortcut registry, ported from legacy/src/components/shortcuts/use-hotkeys.ts
// and use-hotkeys-utils.ts. Pure, so it is unit-tested.
import type { ShortcutDefinition } from '~/types/shortcuts'

const MODIFIER_KEYS = new Set(['shift', 'control', 'alt', 'meta'])
export const SEQUENCE_TIMEOUT_MS = 800

export function isModifierKey(key: string): boolean {
  return MODIFIER_KEYS.has(key)
}

export function hasCommandModifier(e: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey' | 'altKey'>): boolean {
  return e.metaKey || e.ctrlKey || e.altKey
}

export function findSequenceMatch(buffer: string[], shortcuts: ShortcutDefinition[]): ShortcutDefinition | undefined {
  for (let start = 0; start < buffer.length; start++) {
    if (buffer.length > 1 && start === buffer.length - 1) break
    const sequence = buffer.slice(start).join(' ')
    const match = shortcuts.find(shortcut => shortcut.key.toLowerCase() === sequence)
    if (match) return match
  }
  return undefined
}

export function isTypingInInput(target: EventTarget | null): boolean {
  if (!target || typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false
  const tagName = target.tagName.toUpperCase()
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT'
    || target.isContentEditable || target.getAttribute('contenteditable') === 'true'
}

export function matchModifiers(e: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>, shortcut: ShortcutDefinition): boolean {
  const requiresCtrl = shortcut.modifiers?.includes('ctrl')
  const requiresMeta = shortcut.modifiers?.includes('meta')
  const requiresAlt = shortcut.modifiers?.includes('alt')
  const requiresShift = shortcut.modifiers?.includes('shift')

  if (requiresCtrl && requiresMeta) {
    if (!e.ctrlKey && !e.metaKey) return false
  } else if (requiresCtrl && !e.ctrlKey) {
    return false
  } else if (requiresMeta && !e.metaKey) {
    return false
  }
  if (requiresAlt && !e.altKey) return false
  if (requiresShift && !e.shiftKey) return false
  if (!requiresCtrl && !requiresMeta && (e.ctrlKey || e.metaKey)) return false
  if (!requiresAlt && e.altKey) return false
  return true
}

/**
 * A keydown handler over a live list of shortcuts. Returns the handler and a reset for the sequence
 * buffer. Cmd/Ctrl+K always works; inside inputs only Escape does; inside dialogs and menus nothing.
 */
export function createHotkeyHandler(getShortcuts: () => ShortcutDefinition[]) {
  let buffer: string[] = []
  let timer: ReturnType<typeof setTimeout> | null = null

  function reset() {
    buffer = []
    if (timer) clearTimeout(timer)
    timer = null
  }

  function handle(e: KeyboardEvent) {
    const shortcuts = getShortcuts()
    const key = e.key.toLowerCase()

    if ((e.metaKey || e.ctrlKey) && key === 'k') {
      const commandK = shortcuts.find(s => s.key.toLowerCase() === 'k' && (s.modifiers?.includes('meta') || s.modifiers?.includes('ctrl')))
      if (commandK) {
        e.preventDefault()
        commandK.action()
        return
      }
    }

    if (isTypingInInput(e.target)) {
      if (e.key === 'Escape') shortcuts.find(s => s.key.toLowerCase() === 'escape' || s.key.toLowerCase() === 'esc')?.action()
      return
    }
    if (isModifierKey(key)) return
    // Cmd/Ctrl/Alt combos belong to the browser and the OS. Buffering "c" out of Cmd+C would fire
    // the compose shortcut instead of copying.
    if (hasCommandModifier(e)) return
    if (typeof Element !== 'undefined' && e.target instanceof Element && e.target.closest('[role="dialog"], [role="menu"], [role="listbox"]')) return

    buffer.push(key)
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      buffer = []
    }, SEQUENCE_TIMEOUT_MS)

    const sequenceMatch = findSequenceMatch(buffer, shortcuts)
    if (sequenceMatch) {
      e.preventDefault()
      buffer = []
      sequenceMatch.action()
      return
    }

    const singleMatch = shortcuts.find((s) => {
      if ((s.key === '?' || s.key === '/' || s.key === '#') && e.key === s.key) return true
      if (s.key.toLowerCase() !== key) return false
      return matchModifiers(e, s)
    })
    if (singleMatch) {
      e.preventDefault()
      buffer = []
      singleMatch.action()
    }
  }

  return { handle, reset }
}

/** The keys to show for a shortcut in the help dialog, one entry per key cap. */
export function formatShortcutKeys(shortcut: Pick<ShortcutDefinition, 'key' | 'modifiers'>, ctrlLabel: string): string[] {
  const parts: string[] = []
  for (const modifier of shortcut.modifiers ?? []) {
    if (modifier === 'ctrl') parts.push(ctrlLabel)
    if (modifier === 'meta') parts.push('⌘')
    if (modifier === 'alt') parts.push('Alt')
    if (modifier === 'shift') parts.push('Shift')
  }
  parts.push(...shortcut.key.split(' ').map(part => (part === 'escape' ? 'Esc' : part.toUpperCase())))
  return parts
}
