import { DurableObject } from 'cloudflare:workers'

/**
 * One instance per user (addressed by user id). Holds that user's hibernatable WebSockets and
 * fans notifications out to them. Ported from legacy/src/lib/realtime/hub.ts.
 */
export class RealtimeHub extends DurableObject {
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/connect') {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return new Response('Expected WebSocket upgrade', { status: 426 })
      }
      const userId = request.headers.get('X-Mailflare-Realtime-User')
      if (!userId) return new Response('Unauthorized', { status: 401 })
      const pair = new WebSocketPair()
      this.ctx.acceptWebSocket(pair[1])
      pair[1].serializeAttachment({ userId })
      return new Response(null, { status: 101, webSocket: pair[0] })
    }

    if (url.pathname === '/notify' && request.method === 'POST') {
      const message = JSON.stringify(await request.json())
      for (const socket of this.ctx.getWebSockets()) {
        try {
          socket.send(message)
        } catch {
          socket.close(1011, 'Delivery failed')
        }
      }
      return new Response(null, { status: 204 })
    }

    return new Response('Not found', { status: 404 })
  }

  override async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (message === 'ping') socket.send('pong')
    // TODO(realtime workstream): revision pings, see legacy/src/lib/realtime/hub.ts.
  }
}
