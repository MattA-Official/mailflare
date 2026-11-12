// Keep a scheduled reader on the delivered message, or close it after Undo.
// Ported from legacy/src/components/messages/use-send-view-status.ts.
import type { MaybeRefOrGetter } from 'vue'
import { authFetch } from '~/utils/auth-client'
import { clearMessageDetailCache } from '~/utils/messages/detail-cache'
import { resolveSendViewRoute } from '~/utils/messages/send-view-utils'

export function useSendViewStatus(messageId: MaybeRefOrGetter<string>) {
  const route = useRoute()
  const router = useRouter()
  watch([() => toValue(messageId), () => route.path], ([id, pathname], _previous, onCleanup) => {
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
        // Transient failures are retried by the timer or the next change event.
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
    const timer = scheduled ? window.setInterval(onChange, 1000) : undefined
    window.addEventListener('mailflare:messages-changed', onChange)
    onCleanup(() => {
      disposed = true
      if (timer !== undefined) window.clearInterval(timer)
      window.removeEventListener('mailflare:messages-changed', onChange)
    })
  }, { immediate: true })
}
