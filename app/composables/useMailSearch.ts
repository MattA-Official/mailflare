// The mail search box state, shared by the header search and every message list. Ported from
// legacy/src/components/mail-search/mail-search-context.tsx. Owned by the reading-mail workstream.
const SEARCH_DEBOUNCE_MS = 250

// `input` follows every keystroke; `query` is what lists fetch with, and trails it slightly so a typed
// word costs one request instead of one per letter.
const input = ref('')
const query = ref('')
let started = false

function start() {
  if (started) return
  started = true
  let timer: ReturnType<typeof setTimeout> | null = null
  watch(input, (value) => {
    if (timer) clearTimeout(timer)
    // Clearing the box should empty the list at once; typing waits for a pause.
    const delay = value.trim() ? SEARCH_DEBOUNCE_MS : 0
    timer = setTimeout(() => {
      query.value = value.trim() ? value : ''
    }, delay)
  })
  if (import.meta.client) {
    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, () => {
      input.value = ''
      query.value = ''
    })
  }
}

export function useMailSearch() {
  start()
  return {
    input,
    query: computed(() => query.value),
    setQuery: (value: string) => {
      input.value = value
    },
  }
}
