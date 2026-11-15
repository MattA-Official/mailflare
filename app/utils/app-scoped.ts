// Per-app storage for what must not be shared between apps but cannot go in useState either:
// in-flight requests, caches with timestamps, timers. useState values are serialised into the
// payload under SSR, and these are not serialisable. In the browser there is one app; on a server
// there would be one per request, so nothing here could leak between users.
const stores = new WeakMap<object, Map<string, unknown>>()

export function appScoped<T extends object>(key: string, init: () => T): T {
  const nuxtApp = useNuxtApp()
  let store = stores.get(nuxtApp)
  if (!store) stores.set(nuxtApp, store = new Map())
  if (!store.has(key)) store.set(key, init())
  return store.get(key) as T
}
