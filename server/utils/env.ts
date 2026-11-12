import type { H3Event } from 'h3'

/** Every binding declared in nuxt.config.ts (nitro.cloudflare.wrangler). */
export interface WorkerEnv {
  DB: D1Database
  BUCKET: R2Bucket
  KV: KVNamespace
  CACHE: KVNamespace
  INBOUND_QUEUE: Queue
  OUTBOUND_QUEUE: Queue
  AGENT_QUEUE: Queue
  REALTIME: DurableObjectNamespace
  AI: Ai
  IMAGES: ImagesBinding
  EMAIL: SendEmail
  ASSETS: Fetcher
  WORKER_SELF_REFERENCE: Fetcher
  LOGIN_RATE_LIMIT: RateLimit
  AGENT_RATE_LIMIT: RateLimit
  CF_EMAIL_WORKER_NAME: string
  APP_URL: string
  CF_TOKEN?: string
  TURNSTILE_SECRET_KEY?: string
  [key: string]: unknown
}

/**
 * The Worker env. Works in request handlers (pass the event) and in the email, queue, cron and
 * Durable Object contexts, where server/worker.ts has stored it on globalThis.__env__.
 */
export function getEnv(event?: H3Event): WorkerEnv {
  const env = event?.context.cloudflare?.env ?? (globalThis as { __env__?: unknown }).__env__
  if (!env) throw new Error('Cloudflare env is not available in this context')
  return env as WorkerEnv
}
