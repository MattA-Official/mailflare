// Ported from legacy/src/components/shortcuts/types.ts.
export type ModifierKey = 'ctrl' | 'meta' | 'alt' | 'shift'

export interface ShortcutDefinition {
  /** 'j', '?', '/' or a sequence such as 'g i'. */
  key: string
  label: string
  category: 'Navigation' | 'Actions' | 'Composing' | 'Selection' | 'General'
  description?: string
  modifiers?: ModifierKey[]
  allowInInputs?: boolean
  action: () => void
}

export interface CommandItem {
  id: string
  title: string
  subtitle?: string
  category: 'Actions' | 'Navigation' | 'Settings' | 'Mailboxes' | 'General'
  /** An Iconify name such as 'i-lucide-inbox'. */
  icon?: string
  shortcut?: string
  keywords?: string[]
  perform: () => void
}
