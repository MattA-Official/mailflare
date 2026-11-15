import { useClipboard } from '@vueuse/core'

/**
 * Copies text to the clipboard. `copiedValue` holds what was copied for two seconds, so a button can
 * read "Copied" and then go back to its label. A failed copy (permission denied, no clipboard) shows
 * an error toast instead of failing silently.
 */
export function useCopy() {
  const { t } = useLanguage()
  const toast = useToast()
  const { copy: write, copied } = useClipboard({ copiedDuring: 2000, legacy: true })
  const last = ref<string | null>(null)
  const copiedValue = computed(() => (copied.value ? last.value : null))

  async function copy(value: string, success?: string) {
    try {
      await write(value)
      last.value = value
      if (success) toast.add({ title: success, color: 'success', icon: 'i-lucide-copy-check' })
    }
    catch {
      toast.add({ title: t('common.copyFailed'), color: 'error' })
    }
  }

  return { copy, copied, copiedValue }
}
