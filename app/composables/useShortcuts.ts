// Keyboard shortcuts, the command palette and the cheat sheet. Ported from
// legacy/src/components/shortcuts (shortcuts-context, use-hotkeys, use-shortcuts-enabled). The layout
// mounts <AppShortcuts />, which owns the built-in shortcuts and renders the palette and help dialog;
// pages add theirs with registerShortcut/registerCommand.
import type { MaybeRefOrGetter, ShallowRef } from 'vue'
import type { CommandItem, ShortcutDefinition } from '~/types/shortcuts'
import { createHotkeyHandler } from '~/utils/shortcuts/hotkeys'

interface ShortcutsSettingsResponse { enabled?: boolean, error?: unknown }

function useShortcutsState() {
  return {
    enabled: useState('shortcuts-enabled', () => false),
    preferenceLoading: useState('shortcuts-preference-loading', () => true),
    preferenceError: useState<string | null>('shortcuts-preference-error', () => null),
    paletteOpen: useState('shortcuts-palette-open', () => false),
    helpOpen: useState('shortcuts-help-open', () => false),
    // Registered shortcuts and commands carry handlers, and unregister compares them by identity,
    // so the lists are held shallowly.
    customShortcuts: useState('shortcuts-custom', () => shallowRef<ShortcutDefinition[]>([])) as ShallowRef<ShortcutDefinition[]>,
    customCommands: useState('shortcuts-commands', () => shallowRef<CommandItem[]>([])) as ShallowRef<CommandItem[]>,
  }
}

const local = () => appScoped('shortcuts', () => ({ preferenceRequest: null as Promise<void> | null }))

async function readPreference(response: Response, fallback: string): Promise<boolean> {
  const data = (await response.json().catch(() => ({}))) as ShortcutsSettingsResponse
  if (!response.ok || typeof data.enabled !== 'boolean') throw new Error(typeof data.error === 'string' ? data.error : fallback)
  return data.enabled
}

function loadPreference(): Promise<void> {
  const state = local()
  const { enabled, preferenceLoading, preferenceError } = useShortcutsState()
  if (!state.preferenceRequest) {
    preferenceLoading.value = true
    state.preferenceRequest = authFetch('/api/settings/shortcuts', { redirectOnUnauthorized: false })
      .then(response => readPreference(response, 'Failed to load shortcut settings'))
      .then((value) => {
        enabled.value = value
        preferenceError.value = null
      })
      .catch((error: unknown) => {
        // Upstream turns shortcuts on when the preference cannot be read.
        enabled.value = true
        preferenceError.value = error instanceof Error ? error.message : 'Failed to load shortcut settings'
      })
      .finally(() => {
        preferenceLoading.value = false
      })
  }
  return state.preferenceRequest
}

if (import.meta.client) {
  window.addEventListener(AUTH_SESSION_CHANGED_EVENT, () => {
    const { paletteOpen, helpOpen } = useShortcutsState()
    local().preferenceRequest = null
    paletteOpen.value = false
    helpOpen.value = false
    void loadPreference()
  })
}

async function setShortcutsEnabled(next: boolean): Promise<void> {
  const { enabled, preferenceError } = useShortcutsState()
  const previous = enabled.value
  enabled.value = next
  preferenceError.value = null
  try {
    const response = await authFetch('/api/settings/shortcuts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: next }),
    })
    enabled.value = await readPreference(response, 'Failed to update shortcut settings')
  } catch (error) {
    enabled.value = previous
    const message = error instanceof Error ? error.message : 'Failed to update shortcut settings'
    preferenceError.value = message
    throw new Error(message, { cause: error })
  }
}

function upsert<T>(list: ShallowRef<T[]>, item: T, same: (a: T, b: T) => boolean): () => void {
  const index = list.value.findIndex(existing => same(existing, item))
  list.value = index >= 0 ? list.value.map((existing, i) => (i === index ? item : existing)) : [...list.value, item]
  const unregister = () => {
    list.value = list.value.filter(existing => existing !== item)
  }
  // Registered from a component: drop it again when the component goes away.
  if (getCurrentScope()) onScopeDispose(unregister)
  return unregister
}

/** Opens the floating composer; the sidebar button, the "c" shortcut and the command palette share it. */
export function openCompose() {
  useCompose().openComposer()
}

export function useShortcuts() {
  if (import.meta.client) void loadPreference()
  const { enabled, preferenceLoading, preferenceError, paletteOpen, helpOpen, customShortcuts, customCommands } = useShortcutsState()
  const active = computed(() => enabled.value && !preferenceLoading.value)
  return {
    shortcutsEnabled: computed(() => enabled.value),
    shortcutsPreferenceLoading: computed(() => preferenceLoading.value),
    shortcutsPreferenceError: computed(() => preferenceError.value),
    /** Enabled and loaded: the palette, cheat sheet and hotkeys are live. */
    shortcutsActive: active,
    setShortcutsEnabled,
    paletteOpen,
    helpOpen,
    openCommandPalette: () => {
      if (active.value) paletteOpen.value = true
    },
    closeCommandPalette: () => {
      paletteOpen.value = false
    },
    openHelpModal: () => {
      if (active.value) helpOpen.value = true
    },
    closeHelpModal: () => {
      helpOpen.value = false
    },
    /** Replaces a shortcut with the same key. Returns an unregister; components unregister on unmount. */
    registerShortcut: (shortcut: ShortcutDefinition) => upsert(customShortcuts, shortcut, (a, b) => a.key === b.key),
    /** Replaces a command with the same id. Returns an unregister; components unregister on unmount. */
    registerCommand: (command: CommandItem) => upsert(customCommands, command, (a, b) => a.id === b.id),
    customShortcuts: computed(() => customShortcuts.value),
    customCommands: computed(() => customCommands.value),
  }
}

/**
 * Listens for the given shortcuts while the calling component is mounted. Most pages should use
 * registerShortcut instead, so their keys show in the cheat sheet.
 */
export function useHotkeys(shortcuts: MaybeRefOrGetter<ShortcutDefinition[]>, options: { enabled?: MaybeRefOrGetter<boolean> } = {}) {
  if (!import.meta.client) return
  const { handle, reset } = createHotkeyHandler(() => toValue(shortcuts))
  const listening = computed(() => toValue(options.enabled ?? true))
  const listener = (event: KeyboardEvent) => handle(event)
  watch(listening, (on) => {
    window.removeEventListener('keydown', listener)
    reset()
    if (on) window.addEventListener('keydown', listener)
  }, { immediate: true })
  onScopeDispose(() => {
    window.removeEventListener('keydown', listener)
    reset()
  })
}
