// Whether a message's remote content loads without a click, per the user's setting. `allowSender`
// remembers a sender once the user allows their content. Nothing loads until the setting is read.
// Ported from legacy/src/components/messages/use-remote-content.ts.
import type { MaybeRefOrGetter } from 'vue'
import {
  REMOTE_CONTENT_CHANGE_EVENT,
  allowRemoteContentFromSender,
  loadRemoteContentPolicy,
  shouldAutoLoadRemote,
  type RemoteContentPolicy,
} from '~/utils/messages/remote-content-utils'

export function useRemoteContent(sender: MaybeRefOrGetter<string | undefined>, spam: MaybeRefOrGetter<boolean>) {
  const policy = ref<RemoteContentPolicy | null>(null)
  const address = computed(() => toValue(sender)?.trim().toLowerCase())

  watch(address, (current, _previous, onCleanup) => {
    let cancelled = false
    const load = () => {
      loadRemoteContentPolicy(current)
        .then((loaded) => {
          if (!cancelled) policy.value = loaded
        })
        .catch(() => {
          if (!cancelled) policy.value = null
        })
    }
    load()
    window.addEventListener(REMOTE_CONTENT_CHANGE_EVENT, load)
    onCleanup(() => {
      cancelled = true
      window.removeEventListener(REMOTE_CONTENT_CHANGE_EVENT, load)
    })
  }, { immediate: true })

  function allowSender() {
    if (!address.value || toValue(spam) || policy.value?.mode !== 'new_sender') return
    void allowRemoteContentFromSender(address.value).catch(() => undefined)
  }

  return { autoAllow: computed(() => shouldAutoLoadRemote(policy.value, toValue(spam))), allowSender }
}
