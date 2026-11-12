// The realtime connection: one WebSocket per browser (the tab holding the "mailflare:realtime" lock),
// shared with other tabs over a BroadcastChannel, with a polling fallback while disconnected. Ported from
// legacy/src/hooks/use-message-polling.ts and message-realtime-utils.ts.
import { hasActivePushSubscription } from '~/utils/push/client'

export interface NewMessageEvent {
  from: string
  fromName: string | null
  mailboxId: string
  messageId: string
  subject: string | null
  type: 'new_message'
}

export type RealtimeChannelMessage =
  | { type: 'status', connected: boolean }
  | { type: 'status_request' }
  | { type: 'notification', payload: string }
  | { type: 'refresh' }

export const REALTIME_FALLBACK_INTERVAL_MS = 60_000
export const REALTIME_HEARTBEAT_INTERVAL_MS = 25_000
export const REALTIME_RECONNECT_MAX_MS = 30_000
const BROWSER_NOTIFICATIONS_ENABLED_KEY = 'mailflare:browser-notifications-enabled'

export function areBrowserNotificationsEnabled(): boolean {
  try {
    return window.localStorage.getItem(BROWSER_NOTIFICATIONS_ENABLED_KEY) !== 'false'
  } catch {
    return true
  }
}

export function setBrowserNotificationsEnabled(value: boolean): void {
  window.localStorage.setItem(BROWSER_NOTIFICATIONS_ENABLED_KEY, String(value))
}

export function getRealtimeWebSocketUrl(location: Pick<Location, 'protocol' | 'host'> = window.location): string {
  return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/realtime`
}

export function getReconnectDelay(attempt: number): number {
  return Math.min(1_000 * 2 ** attempt, REALTIME_RECONNECT_MAX_MS)
}

export function parseNewMessageEvent(value: string): NewMessageEvent | null {
  try {
    const payload = JSON.parse(value) as Partial<NewMessageEvent>
    if (payload.type !== 'new_message' || typeof payload.messageId !== 'string' || typeof payload.mailboxId !== 'string' || typeof payload.from !== 'string') return null
    return {
      type: 'new_message',
      messageId: payload.messageId,
      mailboxId: payload.mailboxId,
      from: payload.from,
      fromName: typeof payload.fromName === 'string' ? payload.fromName : null,
      subject: typeof payload.subject === 'string' ? payload.subject : null,
    }
  } catch {
    return null
  }
}

export async function showBrowserNewMessageNotification(event: NewMessageEvent): Promise<void> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || !areBrowserNotificationsEnabled() || document.visibilityState === 'visible') return
  if (await hasActivePushSubscription().catch(() => false)) return
  try {
    const notification = new Notification(event.subject || 'New email', {
      body: `From ${event.fromName ?? event.from}`,
      icon: '/icon-96.png',
      tag: event.messageId,
    })
    notification.onclick = () => {
      window.focus()
      window.location.assign(`/inbox/${event.messageId}`)
      notification.close()
    }
  } catch {
    // The in-app new message toast still handles this email.
  }
}

/** Starts the realtime client. `onNewMessage` fires once per tab for each new message. Returns a stop function. */
export function startRealtime(onNewMessage: (event: NewMessageEvent) => void, onSessionChange?: () => void): () => void {
  let socket: WebSocket | null = null
  let channel: BroadcastChannel | null = null
  let lockAbort: AbortController | null = null
  let releaseLeader: (() => void) | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let fallbackTimer: ReturnType<typeof setInterval> | null = null
  let reconnectAttempt = 0
  let revision: string | null = null
  let connected = false
  let leader = false
  let sessionToken = getClientSessionToken()
  let stopped = false

  function dispatchMessagesChanged() {
    window.dispatchEvent(new CustomEvent('mailflare:messages-changed', { detail: { realtime: true } }))
  }

  function clearConnectionTimers() {
    if (reconnectTimer) clearTimeout(reconnectTimer)
    if (heartbeatTimer) clearInterval(heartbeatTimer)
    reconnectTimer = null
    heartbeatTimer = null
  }

  function startFallbackRefresh() {
    if (fallbackTimer) return
    fallbackTimer = setInterval(() => {
      if (!connected && document.visibilityState === 'visible' && getClientSessionToken()) dispatchMessagesChanged()
    }, REALTIME_FALLBACK_INTERVAL_MS)
  }

  function setConnected(value: boolean) {
    connected = value
    if (value) {
      if (fallbackTimer) clearInterval(fallbackTimer)
      fallbackTimer = null
    } else {
      startFallbackRefresh()
    }
    if (leader) channel?.postMessage({ type: 'status', connected: value } satisfies RealtimeChannelMessage)
  }

  function handleNotification(payload: string, fromSocket: boolean) {
    try {
      const parsed = JSON.parse(payload) as { type?: string, revision?: string, changed?: boolean, draftId?: string, mailboxId?: string }
      if (parsed.type === 'revision' && typeof parsed.revision === 'string') {
        revision = parsed.revision
        if (parsed.changed) {
          dispatchMessagesChanged()
          if (fromSocket) channel?.postMessage({ type: 'refresh' } satisfies RealtimeChannelMessage)
        }
        return
      }
      if (parsed.type === 'agent_draft' && parsed.draftId && parsed.mailboxId) {
        window.dispatchEvent(new CustomEvent('mailflare:agent-draft', { detail: parsed }))
        dispatchMessagesChanged()
        if (fromSocket) channel?.postMessage({ type: 'notification', payload } satisfies RealtimeChannelMessage)
        return
      }
    } catch {
      return
    }
    const event = parseNewMessageEvent(payload)
    if (!event) return
    dispatchMessagesChanged()
    onNewMessage(event)
    if (fromSocket) {
      void showBrowserNewMessageNotification(event)
      channel?.postMessage({ type: 'notification', payload } satisfies RealtimeChannelMessage)
    }
  }

  function sendHeartbeat() {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ping', revision }))
  }

  function scheduleReconnect() {
    setConnected(false)
    if (stopped || !leader || !getClientSessionToken()) return
    const delay = getReconnectDelay(reconnectAttempt)
    reconnectAttempt += 1
    reconnectTimer = setTimeout(connect, delay)
  }

  function connect() {
    clearConnectionTimers()
    if (stopped || !leader || !getClientSessionToken()) return
    socket = new WebSocket(getRealtimeWebSocketUrl())
    socket.onopen = () => {
      reconnectAttempt = 0
      revision = null
      setConnected(true)
      dispatchMessagesChanged()
      sendHeartbeat()
      heartbeatTimer = setInterval(sendHeartbeat, REALTIME_HEARTBEAT_INTERVAL_MS)
    }
    socket.onmessage = (message) => {
      if (message.data === 'pong' || typeof message.data !== 'string') return
      handleNotification(message.data, true)
    }
    socket.onerror = () => socket?.close()
    socket.onclose = () => {
      clearConnectionTimers()
      scheduleReconnect()
    }
  }

  function requestLeadership() {
    if (stopped || !getClientSessionToken()) return
    if (!channel || !navigator.locks) {
      leader = true
      connect()
      return
    }
    lockAbort = new AbortController()
    void navigator.locks.request('mailflare:realtime', { signal: lockAbort.signal }, async () => {
      if (stopped || !getClientSessionToken()) return
      await new Promise<void>((resolve) => {
        releaseLeader = resolve
        leader = true
        connect()
      })
      leader = false
      releaseLeader = null
    }).catch(() => {})
  }

  function restartForSessionChange() {
    sessionToken = getClientSessionToken()
    if (socket) {
      socket.onclose = null
      socket.close(1000, 'Session changed')
      socket = null
    }
    clearConnectionTimers()
    setConnected(false)
    lockAbort?.abort()
    releaseLeader?.()
    leader = false
    reconnectAttempt = 0
    revision = null
    onSessionChange?.()
    requestLeadership()
  }

  function onChannelMessage(event: MessageEvent<RealtimeChannelMessage>) {
    const message = event.data
    if (message?.type === 'status_request' && leader) {
      channel?.postMessage({ type: 'status', connected } satisfies RealtimeChannelMessage)
    } else if (message?.type === 'status' && !leader) {
      setConnected(message.connected)
      if (message.connected) dispatchMessagesChanged()
    } else if (message?.type === 'notification' && !leader) {
      handleNotification(message.payload, false)
    } else if (message?.type === 'refresh') {
      dispatchMessagesChanged()
    }
  }

  function onLocalMessagesChanged(event: Event) {
    if ((event as CustomEvent<{ realtime?: boolean }>).detail?.realtime) return
    channel?.postMessage({ type: 'refresh' } satisfies RealtimeChannelMessage)
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'visible' && getClientSessionToken()) dispatchMessagesChanged()
  }

  function onStorageChange() {
    if (sessionToken !== getClientSessionToken()) restartForSessionChange()
  }

  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel('mailflare:realtime')
    channel.onmessage = onChannelMessage
    channel.postMessage({ type: 'status_request' } satisfies RealtimeChannelMessage)
  }
  window.addEventListener(AUTH_SESSION_CHANGED_EVENT, restartForSessionChange)
  window.addEventListener('storage', onStorageChange)
  window.addEventListener('mailflare:messages-changed', onLocalMessagesChanged)
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('focus', onVisibilityChange)
  startFallbackRefresh()
  requestLeadership()

  return () => {
    stopped = true
    window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, restartForSessionChange)
    window.removeEventListener('storage', onStorageChange)
    window.removeEventListener('mailflare:messages-changed', onLocalMessagesChanged)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('focus', onVisibilityChange)
    if (leader) channel?.postMessage({ type: 'status', connected: false } satisfies RealtimeChannelMessage)
    lockAbort?.abort()
    releaseLeader?.()
    clearConnectionTimers()
    if (fallbackTimer) clearInterval(fallbackTimer)
    channel?.close()
    if (socket) {
      socket.onclose = null
      socket.close(1000, 'Client closed')
    }
  }
}
