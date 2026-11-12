// A mailbox's user-created folders, for "Move to". Ported from use-mailbox-folders.ts.
import type { MaybeRefOrGetter } from 'vue'
import type { CustomFolderSummary } from '~/utils/messages/types'
import { getMailboxFolders } from '~/utils/folders/client'

export function useMailboxFolders(mailboxId: MaybeRefOrGetter<string | undefined | null>) {
  const folders = shallowRef<CustomFolderSummary[]>([])
  watch(() => toValue(mailboxId), (id, _previous, onCleanup) => {
    folders.value = []
    if (!id) return
    let cancelled = false
    onCleanup(() => {
      cancelled = true
    })
    getMailboxFolders<{ folders?: CustomFolderSummary[] }>(id)
      .then((data) => {
        if (!cancelled) folders.value = data.folders ?? []
      })
      .catch(() => undefined)
  }, { immediate: true })
  return folders
}
