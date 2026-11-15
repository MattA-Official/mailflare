// The mail search box state, shared by the header search and every message list. Ported from
// legacy/src/components/mail-search/mail-search-context.tsx. Owned by the reading-mail workstream.
const SEARCH_DEBOUNCE_MS = 250

// `input` follows every keystroke; `query` is what lists fetch with, and trails it slightly so a typed
// word costs one request instead of one per letter.
const useInput = () => useState('mail-search-input', () => '')
const useQuery = () => useState('mail-search-query', () => '')

function start() {
  if (!import.meta.client) return
  const state = appScoped('mail-search', () => ({ started: false }))
  if (state.started) return
  state.started = true
  const input = useInput()
  const query = useQuery()
  let timer: ReturnType<typeof setTimeout> | null = null
  // Detached from the calling component, so the debounce outlives it.
  effectScope(true).run(() => {
    watch(input, (value) => {
      if (timer) clearTimeout(timer)
      // Clearing the box should empty the list at once; typing waits for a pause.
      const delay = value.trim() ? SEARCH_DEBOUNCE_MS : 0
      timer = setTimeout(() => {
        query.value = value.trim() ? value : ''
      }, delay)
    })
  })
  window.addEventListener(AUTH_SESSION_CHANGED_EVENT, () => {
    input.value = ''
    query.value = ''
  })
}

export function useMailSearch() {
  start()
  const input = useInput()
  const query = useQuery()
  return {
    input,
    query: computed(() => query.value),
    setQuery: (value: string) => {
      input.value = value
    },
  }
}
