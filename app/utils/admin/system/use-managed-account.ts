// Shared load of one managed account for the /accounts/[id] pages, so switching between the
// details, password, permissions and mailboxes tabs reuses the same request.
import { fetchManagedAccount } from '~/utils/admin/system/accounts'

export function useManagedAccount(id: MaybeRefOrGetter<string>) {
  return useAsyncData(() => `admin-account:${toValue(id)}`, () => fetchManagedAccount(toValue(id)))
}

/** A local, editable copy of the loaded account that follows reloads. */
export function useManagedAccountDraft(id: MaybeRefOrGetter<string>) {
  const result = useManagedAccount(id)
  const draft = ref<NonNullable<typeof result.data.value> | null>(null)
  watch(result.data, (value) => {
    draft.value = value ? { ...value } : null
  }, { immediate: true })
  return { ...result, draft }
}
