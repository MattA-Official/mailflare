import { fileURLToPath } from 'node:url'

// Mailflare on Nuxt, deployed as a single Cloudflare Worker.
// The upstream Next.js app lives in ./legacy for reference while the port is in progress.
const D1_DATABASE_ID = '2c5e6a86-7940-44cc-9f11-2dc855d60cd9'
const KV_NAMESPACE_ID = '7508952e90a94acca8e3b1cb27854e9f'
const CACHE_NAMESPACE_ID = 'f35fc0ad21a5478ca13216230146e872'
const WORKER_NAME = 'mailflare'

export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  future: { compatibilityVersion: 4 },
  modules: ['@nuxthub/core', '@nuxt/ui', '@nuxt/eslint'],
  css: ['~/assets/css/main.css'],
  ignore: ['legacy/**'],
  devtools: { enabled: true },

  hub: {
    db: { dialect: 'sqlite', driver: 'd1', connection: { databaseId: D1_DATABASE_ID } },
    blob: { driver: 'cloudflare-r2', binding: 'BUCKET', bucketName: 'mailflare-raw' },
    kv: { driver: 'cloudflare-kv-binding', namespaceId: KV_NAMESPACE_ID },
    cache: { driver: 'cloudflare-kv-binding', namespaceId: CACHE_NAMESPACE_ID },
  },

  nitro: {
    preset: 'cloudflare_module',
    // Custom Worker entry: wraps Nitro's module handler and adds the realtime Durable Object
    // plus the email, queue and scheduled handlers. See server/worker.ts.
    entry: fileURLToPath(new URL('./server/worker.ts', import.meta.url)),
    ignore: ['legacy/**'],
    cloudflare: {
      deployConfig: true,
      nodeCompat: true,
      wrangler: {
        name: WORKER_NAME,
        compatibility_date: '2026-11-01',
        compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public'],
        routes: [{ pattern: 'mail.flytower.dev', custom_domain: true }],
        observability: { enabled: true },
        upload_source_maps: true,
        images: { binding: 'IMAGES' },
        ai: { binding: 'AI' },
        send_email: [{ name: 'EMAIL' }],
        services: [{ binding: 'WORKER_SELF_REFERENCE', service: WORKER_NAME }],
        triggers: { crons: ['0 2 * * *', '*/5 * * * *'] },
        vars: { CF_EMAIL_WORKER_NAME: WORKER_NAME, APP_URL: 'https://mail.flytower.dev' },
        ratelimits: [
          { name: 'LOGIN_RATE_LIMIT', namespace_id: '1001', simple: { limit: 20, period: 60 } },
          { name: 'AGENT_RATE_LIMIT', namespace_id: '1002', simple: { limit: 120, period: 60 } },
        ],
        durable_objects: { bindings: [{ name: 'REALTIME', class_name: 'RealtimeHub' }] },
        migrations: [{ tag: 'v1', new_sqlite_classes: ['RealtimeHub'] }],
        queues: {
          producers: [
            { binding: 'INBOUND_QUEUE', queue: 'mailflare-inbound' },
            { binding: 'OUTBOUND_QUEUE', queue: 'mailflare-outbound' },
            { binding: 'AGENT_QUEUE', queue: 'mailflare-agent' },
          ],
          consumers: [
            { queue: 'mailflare-inbound', max_batch_size: 5, max_retries: 3 },
            { queue: 'mailflare-outbound', max_batch_size: 5, max_retries: 3 },
            { queue: 'mailflare-agent', max_batch_size: 1, max_retries: 3 },
          ],
        },
      },
    },
  },

  typescript: { tsConfig: { exclude: ['../legacy'] } },
  eslint: { config: { stylistic: false } },
})
