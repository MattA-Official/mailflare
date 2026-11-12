// Whether conversations display newest to oldest. Ported from use-latest-messages-first.ts.
import { useStoredToggle } from './storedToggle'

export function useLatestMessagesFirst() {
  return useStoredToggle('mailflare-latest-messages-first', 'mailflare:latest-messages-first-changed')
}
