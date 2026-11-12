// Worker entrypoint. Nitro builds this file as the Worker's main module.
//
// Nitro's own Cloudflare hooks (cloudflare:email, cloudflare:queue) run inside waitUntil, after the
// handler has returned. That is too late for message.setReject()/forward() and for per-message
// queue ack/retry, so those handlers are implemented here directly, as upstream's worker.ts did.
import nitroHandler from 'nitropack/presets/cloudflare/runtime/cloudflare-module'
import { handleRealtimeUpgrade } from './worker/realtime'
import { handleEmail } from './worker/email'
import { handleQueue } from './worker/queue'
import { handleScheduled } from './worker/scheduled'

export { RealtimeHub } from './realtime/hub'

type Env = Record<string, unknown>

function bindEnv(env: Env) {
  // hub:db, hub:blob and hub:kv resolve bindings from globalThis.__env__ outside a request.
  ;(globalThis as { __env__?: Env }).__env__ = env
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url)
    if (url.pathname === '/api/realtime') {
      bindEnv(env)
      return handleRealtimeUpgrade(request, env as never)
    }
    return nitroHandler.fetch!(request as never, env as never, ctx as never)
  },
  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext) {
    bindEnv(env)
    await handleEmail(message, env as never, ctx)
  },
  async queue(batch: MessageBatch, env: Env, ctx: ExecutionContext) {
    bindEnv(env)
    await handleQueue(batch, env as never, ctx)
  },
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    bindEnv(env)
    await handleScheduled(controller, env as never, ctx)
  },
}
