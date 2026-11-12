// A boolean preference kept in localStorage and shared by every component on the page. Other tabs
// follow through the storage event. Used for upstream's conversation view, two-column reading and
// newest-first toggles, which all default to on and store "on" / "off".
import type { Ref } from 'vue'

const toggles = new Map<string, Ref<boolean>>()

function readStored(key: string): boolean {
  try {
    return localStorage.getItem(key) !== 'off'
  }
  catch {
    return true
  }
}

export function useStoredToggle(key: string, changeEvent: string): [Readonly<Ref<boolean>>, (next: boolean) => void] {
  let state = toggles.get(key)
  if (!state) {
    const created = ref(import.meta.client ? readStored(key) : true)
    state = created
    toggles.set(key, created)
    if (import.meta.client) {
      const sync = () => {
        created.value = readStored(key)
      }
      window.addEventListener(changeEvent, sync)
      window.addEventListener('storage', sync)
    }
  }
  const target = state
  function update(next: boolean) {
    try {
      localStorage.setItem(key, next ? 'on' : 'off')
    }
    catch {
      // Private mode or blocked storage: the toggle still applies for this page.
    }
    target.value = next
    window.dispatchEvent(new Event(changeEvent))
  }
  return [readonly(target), update]
}
