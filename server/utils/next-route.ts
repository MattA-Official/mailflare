import { getRequestURL, toWebRequest, type H3Event } from 'h3'
import { toNextRequest } from '#lib/http/next-compat'

type RouteContext = { params: Promise<Record<string, string | string[]>> }
type RouteHandler = (request: never, context: never) => Response | Promise<Response>
type RouteModule = Record<string, unknown>

/**
 * Nitro's Cloudflare entry only forwards bodies for POST, PUT and PATCH, so h3 waits forever on the
 * body of a DELETE (upstream's DELETE /api/accounts and friends send JSON) and workerd cancels the
 * request as hung. Such bodies are still unread on the original Worker request; use that.
 */
function webRequest(event: H3Event): Request {
  const original = (event.context.cloudflare as { request?: Request } | undefined)?.request
  if (original?.body && !/^(post|put|patch)$/i.test(event.method)) {
    return new Request(getRequestURL(event), { method: event.method, headers: event.headers, body: original.body, duplex: 'half' } as RequestInit)
  }
  return toWebRequest(event)
}

/**
 * Mounts a ported Next.js route module (`export async function GET(request, { params })`) as a Nitro
 * handler. `catchAll` names the params Next delivers as string arrays.
 */
export function defineNextRoute(route: RouteModule, options: { catchAll?: string[] } = {}) {
  return defineEventHandler(async (event: H3Event) => {
    const method = event.method.toUpperCase()
    const handler = (route[method] ?? (method === 'HEAD' ? route.GET : undefined)) as RouteHandler | undefined
    if (typeof handler !== 'function') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
    }
    const params: Record<string, string | string[]> = { ...(event.context.params ?? {}) }
    for (const name of options.catchAll ?? []) {
      const value = params[name]
      params[name] = typeof value === 'string' && value ? value.split('/').map(decodeURIComponent) : []
    }
    const context: RouteContext = { params: Promise.resolve(params) }
    try {
      return await handler(toNextRequest(webRequest(event)) as never, context as never)
    } catch (error) {
      // Upstream's requireUser() throws a bare Error; answer 401 instead of a 500.
      if (error instanceof Error && error.message === 'Unauthorized') {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
      }
      throw error
    }
  })
}
