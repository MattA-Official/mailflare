// Whether lists collapse each conversation to one row. On by default and remembered per browser.
// Ported from legacy/src/components/messages/use-conversation-view.ts.
import { useStoredToggle } from './storedToggle'

export function useConversationView() {
  return useStoredToggle('mailflare-conversation-view', 'mailflare:conversation-view-changed')
}
