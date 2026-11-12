// Keep a scheduled reader on the delivered message, or close it after Undo.
// Ported from legacy/src/components/messages/use-send-view-status.ts.
import type { MaybeRefOrGetter } from 'vue'
import { authFetch } from '~/utils/auth-client'
import { clearMessageDetailCache } from '~/utils/messages/detail-cache'
import { resolveSendViewRoute } from '~/utils/messages/send-view-utils'

export function useSendViewStatus(messageId: MaybeRefOrGetter<string>, scheduledAt?: MaybeRefOrGetter<string | null | undefined>) {
  const route = useRoute()
  const router = useRouter()
  watch([() => toValue(messageId), () => route.path, () => toValue(scheduledAt)], ([id, pathname, scheduledAtValue], _previous, onCleanup) => {
    const scheduled = pathname === `/scheduled/${id}`
    if (!scheduled && pathname !== `/sent/${id}`) return
    let disposed = false
    let checking = false
    let checkAgain = false
    let moved = false
    async function check() {
      if (disposed || moved) return
      if (checking) {
        checkAgain = true
        return
      }
      checking = true
      try {
        const response = await authFetch(`/api/messages/${id}/send-status`, { cache: 'no-store' })
        if (!response.ok) return
        const { status } = await response.json() as { status?: string }
        if (disposed || !status) return
        const destination = resolveSendViewRoute(pathname, id, status)
        if (!destination) return
        moved = true
        clearMessageDetailCache()
        window.dispatchEvent(new Event('mailflare:messages-changed'))
        void router.replace(destination)
      }
      catch {
        // Transient failures wait for the next change event or fallback check.
      }
      finally {
        checking = false
        if (checkAgain && !disposed) {
          checkAgain = false
          void check()
        }
      }
    }
    const onChange = () => void check()
    void check()

    // Check at the send deadline, then slowly until the job has gone out.
    let deadlineTimer: number | undefined
    let fallbackTimer: number | undefined
    if (scheduled && scheduledAtValue) {
      const deadline = new Date(scheduledAtValue).getTime()
      if (Number.isFinite(deadline)) {
        const startFallback = () => {
          void check()
          fallbackTimer = window.setInterval(onChange, 10_000)
        }
        const delay = deadline - Date.now()
        if (delay <= 0) startFallback()
        else deadlineTimer = window.setTimeout(startFallback, delay)
      }
    }
    else if (scheduled) {
      // The detail response may not have supplied the job's time yet.
      fallbackTimer = window.setInterval(onChange, 15_000)
    }
    window.addEventListener('mailflare:messages-changed', onChange)
    onCleanup(() => {
      disposed = true
      if (deadlineTimer !== undefined) window.clearTimeout(deadlineTimer)
      if (fallbackTimer !== undefined) window.clearInterval(fallbackTimer)
      window.removeEventListener('mailflare:messages-changed', onChange)
    })
  }, { immediate: true })
}
