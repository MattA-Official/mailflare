// Account switches and sign-outs drop everything scoped to the previous user (upstream Providers).
import { clearMessageClientState } from '~/utils/messages/list-cache'

export default defineNuxtPlugin(() => {
  window.addEventListener(AUTH_SESSION_CHANGED_EVENT, (event) => {
    clearMessageClientState()
    clearNuxtData()
    // The layout outlives an account switch, so its all-mailbox counts (the app badge) would keep the old number.
    if ((event as CustomEvent<AuthSessionChangedDetail>).detail?.authenticated) {
      window.dispatchEvent(new Event('mailflare:message-counts-changed'))
    }
  })
})
