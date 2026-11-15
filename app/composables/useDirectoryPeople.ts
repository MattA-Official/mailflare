// Fork-only. Everyone in the directory, loaded once and kept for a few minutes, so mail views can show a
// colleague's directory name, title and department without a request per address.
import { fetchDirectory, type DirectoryListPerson } from '~/utils/directory/directory'
import { appScoped } from '~/utils/app-scoped'
import { getEmailAddress } from '#lib/email/address'

const STALE_AFTER_MS = 5 * 60_000

export function useDirectoryPeople() {
  const people = useState<DirectoryListPerson[]>('directory-people', () => [])
  const loader = appScoped('directory-people-loader', () => ({ loadedAt: 0, pending: null as Promise<void> | null }))

  function load() {
    if (loader.pending || Date.now() - loader.loadedAt < STALE_AFTER_MS) return loader.pending ?? Promise.resolve()
    loader.pending = fetchDirectory()
      .then((result) => {
        people.value = result.people
        loader.loadedAt = Date.now()
      })
      // A failed load leaves mail views as they were and tries again next time.
      .catch(() => {})
      .finally(() => { loader.pending = null })
    return loader.pending
  }

  const byAddress = computed(() => {
    const map = new Map<string, DirectoryListPerson>()
    for (const person of people.value) {
      for (const address of person.addresses ?? [person.email]) map.set(address.toLowerCase(), person)
    }
    return map
  })

  function find(address: string | null | undefined): DirectoryListPerson | null {
    // Accepts a bare address or a whole "Name <address>" header value.
    return address ? byAddress.value.get(getEmailAddress(address).trim().toLowerCase()) ?? null : null
  }

  return { people, load, find }
}
