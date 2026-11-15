// A boolean preference kept in localStorage and shared by every component on the page. Other tabs
// follow through the storage event. Used for upstream's conversation view, two-column reading and
// newest-first toggles, which all default to on and store "on" / "off".
import type { Ref } from 'vue'

function readStored(key: string): boolean {
  try {
    return localStorage.getItem(key) !== 'off'
  }
  catch {
    return true
  }
}

export function useStoredToggle(key: string, changeEvent: string): [Readonly<Ref<boolean>>, (next: boolean) => void] {
  const target = useState(`stored-toggle:${key}`, () => (import.meta.client ? readStored(key) : true))
  const listening = appScoped('stored-toggles', () => new Set<string>())
  if (import.meta.client && !listening.has(key)) {
    listening.add(key)
    const sync = () => {
      target.value = readStored(key)
    }
    window.addEventListener(changeEvent, sync)
    window.addEventListener('storage', sync)
  }
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
