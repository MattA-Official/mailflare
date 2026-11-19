// Prefetch on hover and open on click for a list row. Ported from
// legacy/src/components/messages/message-navigation.tsx. Nuxt has no RSC payload to prefetch, so
// only the message detail cache is warmed.
import type { Message } from '~/types/messages'
import { fetchCachedMessageDetail, getCachedMessageDetail, primeMessageDetail } from '~/utils/messages/detail-cache'
import { warmMessageInvite } from '~/utils/calendar/invite-cache'

const HOVER_PREFETCH_DELAY_MS = 120

export function useMessageNavigation(href: () => string, message: () => Message) {
  let hoverTimer: number | null = null
  let idleCallback: number | null = null

  function warmDetail() {
    const current = message()
    const cached = getCachedMessageDetail(current.id)
    if (cached?.body) {
      warmMessageInvite(current.id, cached)
      return
    }
    // Seed the header while the body loads.
    primeMessageDetail({ ...current })
    void fetchCachedMessageDetail(current.id, true)
      .then(detail => warmMessageInvite(current.id, detail))
      .catch(() => {})
  }

  function cancelPrefetch() {
    if (hoverTimer) {
      window.clearTimeout(hoverTimer)
      hoverTimer = null
    }
    if (idleCallback !== null && 'cancelIdleCallback' in window) {
      window.cancelIdleCallback(idleCallback)
      idleCallback = null
    }
  }

  function prefetch() {
    const cached = getCachedMessageDetail(message().id)
    if (cached?.body) {
      warmMessageInvite(message().id, cached)
      return
    }
    if (hoverTimer) return
    hoverTimer = window.setTimeout(() => {
      hoverTimer = null
      if ('requestIdleCallback' in window) idleCallback = window.requestIdleCallback(warmDetail, { timeout: 400 })
      else warmDetail()
    }, HOVER_PREFETCH_DELAY_MS)
  }

  function prefetchNow() {
    // Start the invitation in parallel with the body for a tap that is about to navigate.
    warmMessageInvite(message().id, getCachedMessageDetail(message().id))
    warmDetail()
  }

  function onNavigate(event: MouseEvent, markRead = false) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    const current = message()
    primeMessageDetail({ ...current, read: markRead || current.read })
    warmMessageInvite(current.id, getCachedMessageDetail(current.id))
    void navigateTo(href())
  }

  onBeforeUnmount(cancelPrefetch)

  return { onNavigate, prefetch, prefetchNow, cancelPrefetch }
}
