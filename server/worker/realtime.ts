import type { WorkerEnv } from '../utils/env'

/** WebSocket upgrades never reach Nitro: a 101 response with a webSocket cannot pass through h3. */
export async function handleRealtimeUpgrade(request: Request, env: WorkerEnv): Promise<Response> {
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return new Response('Expected WebSocket upgrade', { status: 426 })
  }
  // TODO(auth workstream): authenticate the session cookie and check the Origin header.
  const userId = new URL(request.url).searchParams.get('spike-user')
  if (!userId) return new Response('Unauthorized', { status: 401 })
  const hub = env.REALTIME.get(env.REALTIME.idFromName(userId))
  const hubRequest = new Request('https://mailflare-realtime/connect', request)
  hubRequest.headers.set('X-Mailflare-Realtime-User', userId)
  return hub.fetch(hubRequest)
}
