// Whether the mailing-list banner on a message was dismissed. Ported from
// legacy/src/components/messages/use-mailing-list-banner.ts.
import type { MaybeRefOrGetter } from 'vue'

// Dismissed message ids live in one capped list, not a key per message, so
// storage stays bounded even as messages are dismissed and deleted over time.
const STORAGE_KEY = 'mailflare-mailing-list-banner'
const MAX_DISMISSED = 500

function readDismissedIds(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  }
  catch {
    return []
  }
}

export function useMailingListBanner(messageId: MaybeRefOrGetter<string>) {
  const dismissedNow = ref(new Set<string>())
  const dismissed = computed(() => {
    const id = toValue(messageId)
    return dismissedNow.value.has(id) || readDismissedIds().includes(id)
  })

  function dismiss() {
    const id = toValue(messageId)
    try {
      const ids = readDismissedIds().filter(other => other !== id)
      ids.push(id)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(-MAX_DISMISSED)))
    }
    catch {
      // Private mode or blocked storage: the banner still hides for this view.
    }
    dismissedNow.value = new Set([...dismissedNow.value, id])
  }

  return { dismissed, dismiss }
}
