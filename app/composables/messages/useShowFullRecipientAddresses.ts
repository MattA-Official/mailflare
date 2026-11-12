// The signed-in user's choice for To, Cc and Bcc. Default is the mailbox only.
// Ported from legacy/src/components/messages/use-show-full-recipient-addresses.ts.
import { loadShowFullRecipientAddresses, updateShowFullRecipientAddresses } from '~/utils/messages/recipient-addresses-utils'

export function useShowFullRecipientAddresses() {
  const enabled = ref(false)
  const isLoading = ref(true)
  const error = ref<string | null>(null)

  onMounted(() => {
    let cancelled = false
    onScopeDispose(() => {
      cancelled = true
    })
    loadShowFullRecipientAddresses()
      .then((stored) => {
        if (!cancelled) enabled.value = stored
      })
      .catch((loadError) => {
        if (!cancelled) error.value = loadError instanceof Error ? loadError.message : 'Failed to load recipient address settings'
      })
      .finally(() => {
        if (!cancelled) isLoading.value = false
      })
  })

  async function setEnabled(next: boolean) {
    const previous = enabled.value
    enabled.value = next
    error.value = null
    try {
      enabled.value = await updateShowFullRecipientAddresses(next)
    }
    catch (updateError) {
      enabled.value = previous
      const message = updateError instanceof Error ? updateError.message : 'Failed to update recipient address settings'
      error.value = message
      throw new Error(message, { cause: updateError })
    }
  }

  return { enabled: readonly(enabled), error: readonly(error), isLoading: readonly(isLoading), setEnabled }
}
