import type { WorkerEnv } from '../utils/env'

/** Email Routing handler. Stores raw MIME in R2 and enqueues; never parses inline. */
export async function handleEmail(message: ForwardableEmailMessage, env: WorkerEnv, _ctx: ExecutionContext) {
  // TODO(mail pipeline workstream): port legacy/worker.ts email(), including routing rules.
  const raw = await new Response(message.raw).arrayBuffer()
  const rawR2Key = `raw/spike/${Date.now()}-${crypto.randomUUID()}.eml`
  await env.BUCKET.put(rawR2Key, raw)
  await env.INBOUND_QUEUE.send({ from: message.from, to: message.to, rawR2Key })
}
