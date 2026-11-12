// Prefetch on hover and open on click for a list row. Ported from
// legacy/src/components/messages/message-navigation.tsx. Nuxt has no RSC payload to prefetch, so
// only the message detail cache is warmed.
import type { Message } from '~/types/messages'
import { fetchCachedMessageDetail, getCachedMessageDetail, primeMessageDetail } from '~/utils/messages/detail-cache'

const HOVER_PREFETCH_DELAY_MS = 120

export function useMessageNavigation(href: () => string, message: () => Message) {
  let hoverTimer: number | null = null
  let idleCallback: number | null = null

  function warmDetail() {
    const current = message()
    if (getCachedMessageDetail(current.id)?.body) return
    // Seed the header while the body loads.
    primeMessageDetail({ ...current })
    void fetchCachedMessageDetail(current.id, true).catch(() => {})
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
    if (hoverTimer || getCachedMessageDetail(message().id)?.body) return
    hoverTimer = window.setTimeout(() => {
      hoverTimer = null
      if ('requestIdleCallback' in window) idleCallback = window.requestIdleCallback(warmDetail, { timeout: 400 })
      else warmDetail()
    }, HOVER_PREFETCH_DELAY_MS)
  }

  function prefetchNow() {
    warmDetail()
  }

  function onNavigate(event: MouseEvent, markRead = false) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    const current = message()
    primeMessageDetail({ ...current, read: markRead || current.read })
    void navigateTo(href())
  }

  onBeforeUnmount(cancelPrefetch)

  return { onNavigate, prefetch, prefetchNow, cancelPrefetch }
}
