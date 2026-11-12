// Registers the service worker (offline shell, Web Push, app badge) and keeps it updated. Ported from
// legacy/src/components/pwa-service-worker.tsx.
import { registerMailflareServiceWorker } from '~/utils/push/client'

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000

export default defineNuxtPlugin(() => {
  if (!('serviceWorker' in navigator) || import.meta.dev) return
  const hadController = Boolean(navigator.serviceWorker.controller)
  const checkForUpdate = (registration: ServiceWorkerRegistration) => {
    registration.update().catch(error => console.warn('[pwa] update check failed', error))
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // The first claim of a fresh install is not an update.
    if (hadController) console.info('[pwa] new version active; it applies fully on next reload')
  })

  registerMailflareServiceWorker()
    .then((registration) => {
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing
        worker?.addEventListener('statechange', () => {
          // The worker normally skips waiting itself; this covers one that was already waiting.
          if (worker.state === 'installed') registration.waiting?.postMessage({ type: 'SKIP_WAITING' })
        })
      })
      if (registration.waiting && navigator.serviceWorker.controller) registration.waiting.postMessage({ type: 'SKIP_WAITING' })
      setInterval(() => checkForUpdate(registration), UPDATE_CHECK_INTERVAL_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate(registration)
      })
    })
    .catch(error => console.warn('Mailflare service worker registration failed', error))
})
