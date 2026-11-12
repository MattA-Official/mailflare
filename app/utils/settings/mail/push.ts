// Web Push subscription from the browser. Ported from legacy/src/lib/push/client.ts.
// The service worker is public/sw.js.

interface PushConfigResponse {
  enabled: boolean
  publicKey: string | null
}

export interface PushState {
  supported: boolean
  configured: boolean
  permission: NotificationPermission | 'unsupported'
  subscribed: boolean
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0))
}

export function browserSupportsPush(): boolean {
  return window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
}

async function loadPushConfig(): Promise<PushConfigResponse> {
  const response = await authFetch('/api/push/config', { redirectOnUnauthorized: false })
  if (!response.ok) throw new Error('Failed to load push notification settings')
  return (await response.json()) as PushConfigResponse
}

async function saveSubscription(subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error('Browser returned an incomplete push subscription')
  const response = await authFetch('/api/push/subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } }),
    redirectOnUnauthorized: false,
  })
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error || 'Failed to save push subscription')
  }
}

export async function getPushState(): Promise<PushState> {
  if (!browserSupportsPush()) return { supported: false, configured: false, permission: 'unsupported', subscribed: false }
  const [config, registration] = await Promise.all([loadPushConfig(), registerServiceWorker()])
  const subscription = await registration.pushManager.getSubscription()
  if (subscription && config.enabled && Notification.permission === 'granted') await saveSubscription(subscription)
  return {
    supported: true,
    configured: config.enabled && !!config.publicKey,
    permission: Notification.permission,
    subscribed: !!subscription && Notification.permission === 'granted',
  }
}

export async function enablePushNotifications(): Promise<void> {
  if (!browserSupportsPush()) throw new Error('Push notifications are not supported by this browser')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notification permission was not granted')
  const config = await loadPushConfig()
  if (!config.enabled || !config.publicKey) throw new Error('Push notifications are not configured on this server')
  const registration = await registerServiceWorker()
  const subscription = await registration.pushManager.getSubscription()
    ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toArrayBuffer(decodeBase64Url(config.publicKey)) })
  try {
    await saveSubscription(subscription)
  } catch (error) {
    await subscription.unsubscribe().catch(() => false)
    throw error
  }
}

export async function disablePushNotifications(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  const registration = await navigator.serviceWorker.getRegistration('/')
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return
  const response = await authFetch('/api/push/subscriptions', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
    redirectOnUnauthorized: false,
  })
  if (!response.ok) throw new Error('Failed to disable push notifications')
  await subscription.unsubscribe()
}
