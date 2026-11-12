import { fileURLToPath } from 'node:url'

// Mailflare on Nuxt, deployed as a single Cloudflare Worker.
// The upstream Next.js app lives in ./legacy for reference while the port is in progress.
const D1_DATABASE_ID = '2c5e6a86-7940-44cc-9f11-2dc855d60cd9'
const KV_NAMESPACE_ID = '7508952e90a94acca8e3b1cb27854e9f'
const CACHE_NAMESPACE_ID = 'f35fc0ad21a5478ca13216230146e872'
const WORKER_NAME = 'flytower-mail'
const r = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  future: { compatibilityVersion: 4 },
  modules: ['@nuxthub/core', '@nuxt/ui', '@nuxt/eslint'],
  css: ['~/assets/css/main.css'],
  // A signed-in app: rendered in the browser. The Worker serves the shell and the API.
  ssr: false,
  ignore: ['legacy/**'],
  devtools: { enabled: true },
  // Upstream's storage key, so a saved light/dark choice carries over.
  colorMode: { storageKey: 'mailflare-theme' },
  // Public values the browser needs. Override at runtime with NUXT_PUBLIC_* vars on the Worker.
  runtimeConfig: {
    public: {
      // Cloudflare Turnstile on sign-in, setup and password reset; off when empty (upstream's
      // NEXT_PUBLIC_TURNSTILE_SITE_KEY). The server checks tokens only when TURNSTILE_SECRET_KEY is set.
      turnstileSiteKey: '',
    },
  },
  // Icons used in the app are bundled into the client, so nothing is fetched from Iconify at runtime.
  icon: { clientBundle: { scan: true }, serverBundle: 'local' },

  // Ported server code keeps upstream's layout: #lib is legacy src/lib, #db is src/db and
  // #handlers is the API route tree (src/app/api and friends).
  alias: {
    '#lib': r('./server/lib'),
    '#db': r('./server/db'),
    '#handlers': r('./server/handlers'),
  },

  hub: {
    // Migrations are applied by the in-app runner (server/lib/migrations), not by NuxtHub.
    db: { dialect: 'sqlite', driver: 'd1', connection: { databaseId: D1_DATABASE_ID }, applyMigrationsDuringDev: false },
    blob: { driver: 'cloudflare-r2', binding: 'BUCKET', bucketName: 'mailflare-raw' },
    kv: { driver: 'cloudflare-kv-binding', namespaceId: KV_NAMESPACE_ID },
    cache: { driver: 'cloudflare-kv-binding', namespaceId: CACHE_NAMESPACE_ID },
  },

  nitro: {
    preset: 'cloudflare_module',
    // Custom Worker entry: wraps Nitro's module handler and adds the realtime Durable Object
    // plus the email, queue and scheduled handlers. See server/worker.ts.
    entry: r('./server/worker.ts'),
    // Lets ported code read the current request (cookies(), headers()) without threading the event.
    experimental: { asyncContext: true },
    // Imported for its side effect in server/worker.ts (passkeys need the Reflect metadata API).
    moduleSideEffects: ['reflect-metadata'],
    typescript: { tsConfig: { compilerOptions: { noImplicitAny: false, noUncheckedIndexedAccess: false, allowImportingTsExtensions: true, lib: ["esnext", "dom", "dom.iterable"] } } },
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
        // @ts-expect-error ratelimits is valid Wrangler config but missing from Nitro's type
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

  // The app project type-checks server handlers through Nitro's typed routes, so it needs the same
  // leniency as the server project. The Worker env types live in shared/types/env.d.ts for both.
  typescript: {
    tsConfig: {
      exclude: ['../legacy'],
      compilerOptions: { noImplicitAny: false, noUncheckedIndexedAccess: false, allowImportingTsExtensions: true },
    },
  },
  eslint: { config: { stylistic: false } },
})
