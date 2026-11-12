// The view config for a user-created folder, named once the mailbox's folders load.
// Ported from legacy/src/components/messages/use-custom-folder-config.ts.
import type { MaybeRefOrGetter } from 'vue'
import { getMailboxFolders } from '~/utils/folders/client'
import { customFolderConfig } from '~/utils/messages/folder-configs'
import type { CustomFolderSummary, MessageFolderConfig } from '~/utils/messages/types'

export function useCustomFolderConfig(folderId: MaybeRefOrGetter<string>) {
  const { selectedMailbox } = useSelectedMailbox()
  const folderName = ref('Folder')

  watch(() => [toValue(folderId), selectedMailbox.value?.id] as const, ([id, mailboxId], _previous, onCleanup) => {
    if (!mailboxId) return
    let cancelled = false
    onCleanup(() => {
      cancelled = true
    })
    getMailboxFolders<{ folders?: CustomFolderSummary[] }>(mailboxId)
      .then((data) => {
        const folder = data.folders?.find(item => item.id === id)
        if (!cancelled && folder) folderName.value = folder.name
      })
      .catch(() => {})
  }, { immediate: true })

  return computed<MessageFolderConfig>(() => customFolderConfig(toValue(folderId), folderName.value))
}
