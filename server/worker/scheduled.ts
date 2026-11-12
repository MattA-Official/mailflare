import type { WorkerEnv } from '../utils/env'

/** Cron handler: "0 2 * * *" (daily backup) and every five minutes (maintenance). */
export async function handleScheduled(controller: ScheduledController, env: WorkerEnv, ctx: ExecutionContext) {
  // TODO(workstreams): port the jobs listed in legacy/worker.ts scheduled().
  ctx.waitUntil(env.KV.put('spike:cron', JSON.stringify({ cron: controller.cron, at: controller.scheduledTime })))
}
