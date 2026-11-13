// Per-browser mail preferences. The storage keys and change events are upstream's, so the message
// list, reader and realtime code follow a change made here. Ported from
// legacy/src/components/messages/use-{conversation-view,latest-messages-first,two-column-reading,auto-advance}.ts
// and hooks/message-realtime-utils.ts.

export interface StoredToggle {
  key: string
  event?: string
  /** The value stored as "on"/"true". */
  onValue: string
  offValue: string
  defaultValue: boolean
}

export const CONVERSATION_VIEW: StoredToggle = { key: 'mailflare-conversation-view', event: 'mailflare:conversation-view-changed', onValue: 'on', offValue: 'off', defaultValue: true }
export const LATEST_MESSAGES_FIRST: StoredToggle = { key: 'mailflare-latest-messages-first', event: 'mailflare:latest-messages-first-changed', onValue: 'on', offValue: 'off', defaultValue: true }
export const TWO_COLUMN_READING: StoredToggle = { key: 'mailflare-two-column-reading', event: 'mailflare:two-column-reading-changed', onValue: 'on', offValue: 'off', defaultValue: true }
/** Whether archiving or deleting an open message opens the next one instead of the list. Off by default. Ported from use-auto-advance.ts. */
export const AUTO_ADVANCE: StoredToggle = { key: 'mailflare-auto-advance', event: 'mailflare:auto-advance-changed', onValue: 'on', offValue: 'off', defaultValue: false }
export const BROWSER_NOTIFICATIONS: StoredToggle = { key: 'mailflare:browser-notifications-enabled', onValue: 'true', offValue: 'false', defaultValue: true }

export function readStoredToggle(toggle: StoredToggle): boolean {
  try {
    const value = localStorage.getItem(toggle.key)
    if (value === toggle.offValue) return false
    if (value === toggle.onValue) return true
    return toggle.defaultValue
  } catch {
    return toggle.defaultValue
  }
}

export function writeStoredToggle(toggle: StoredToggle, enabled: boolean): void {
  try {
    localStorage.setItem(toggle.key, enabled ? toggle.onValue : toggle.offValue)
  } catch {
    // Private mode or blocked storage: the toggle still applies for this page.
  }
  if (toggle.event) window.dispatchEvent(new Event(toggle.event))
}

/** A boolean ref backed by localStorage that follows changes from other tabs and components. */
export function useStoredToggle(toggle: StoredToggle) {
  const enabled = ref(readStoredToggle(toggle))
  const sync = () => {
    enabled.value = readStoredToggle(toggle)
  }
  onMounted(() => {
    sync()
    if (toggle.event) window.addEventListener(toggle.event, sync)
    window.addEventListener('storage', sync)
  })
  onBeforeUnmount(() => {
    if (toggle.event) window.removeEventListener(toggle.event, sync)
    window.removeEventListener('storage', sync)
  })
  return computed({
    get: () => enabled.value,
    set: (next: boolean) => {
      enabled.value = next
      writeStoredToggle(toggle, next)
    },
  })
}
