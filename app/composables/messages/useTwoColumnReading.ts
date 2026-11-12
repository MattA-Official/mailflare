// Whether an open message keeps the list beside it. Ported from use-two-column-reading.ts.
import { useStoredToggle } from './storedToggle'

export function useTwoColumnReading() {
  return useStoredToggle('mailflare-two-column-reading', 'mailflare:two-column-reading-changed')
}
