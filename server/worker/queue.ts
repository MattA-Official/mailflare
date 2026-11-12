import type { WorkerEnv } from '../utils/env'

/** Single consumer for the inbound, outbound and agent queues. */
export async function handleQueue(batch: MessageBatch, env: WorkerEnv, _ctx: ExecutionContext) {
  for (const msg of batch.messages) {
    try {
      // TODO(mail pipeline workstream): port the dispatch in legacy/worker.ts queue().
      await env.KV.put(`spike:queue:${batch.queue}`, JSON.stringify({ body: msg.body, at: Date.now() }))
      msg.ack()
    } catch (err) {
      console.error('Queue processing failed', { queue: batch.queue, attempts: msg.attempts, error: err })
      msg.retry({ delaySeconds: 10 })
    }
  }
}
