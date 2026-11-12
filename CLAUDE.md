# CLAUDE.md

Mailflare, ported from Next.js to Nuxt and deployed as one Cloudflare Worker. This is a personal fork of
[hieunc229/mailflare](https://github.com/hieunc229/mailflare) (AGPL-3.0). Everything runs on Cloudflare:
D1, R2, KV, Queues, a Durable Object, Email Routing and Email Sending.

The port is complete. [docs/PORTING.md](docs/PORTING.md) records how it was done, the decisions and every
deviation from upstream; read its "Deviations" before changing behaviour. [docs/architecture.md](docs/architecture.md)
explains how the server works (upstream's notes, paths mapped). User docs are in `docs/`.

## Rules

- **bun only.** Never npm, pnpm or yarn. `bun install`, `bun run <script>`, `bun add <pkg>`.
- **Work on the `nuxt` branch line.** `nuxt` is the integration branch and deploys to production on every
  push. `main` is upstream's Next.js app at v0.5.4, kept for reference. Branch from `nuxt`, open a PR into
  `nuxt`.
- **Upstream is the reference.** Upstream's Next.js source is on the `main` branch and at
  https://github.com/hieunc229/mailflare. Comments that cite `legacy/...` paths mean upstream's tree.
- **British English** in UI copy you write and in messages to Matt. Ported strings keep upstream's wording.
- Cloudflare only. Do not add support for other hosts, databases, object stores or mail providers.

## Commands

```bash
bun install                 # also generates route stubs and the migration bundle, then nuxt prepare
bun run dev                 # nuxt dev with local D1/R2/KV/queues through Miniflare
bun run build               # production build to .output
bun run preview             # run the built Worker offline in workerd (queues, cron, email, Durable Object)
bun run typecheck           # must pass before pushing
bun run lint
bun run test                # vitest
bun run routes:generate     # after adding or removing a handler under server/handlers
bun run db:bundle           # after adding a migration
```

`bun run dev` does not run queue consumers, the email handler, cron or the Durable Object. Use
`bun run preview` for those: it serves on http://localhost:8787, email can be posted to
`/cdn-cgi/handler/email?from=..&to=..` and cron triggered with `/__scheduled?cron=*/5+*+*+*+*`.

Deploys: Cloudflare Workers Builds builds and deploys the `nuxt` branch to the `flytower-mail` Worker
(https://mail.flytower.dev) on every push. Nobody deploys by hand.

## Layout

```
app/                    Nuxt app: pages, layouts, components, composables (Vue + Nuxt UI)
shared/                 Code and types used by both app and server
server/worker.ts        Worker entrypoint (nitro.entry): fetch, email, queue, scheduled, RealtimeHub export
server/realtime/hub.ts  The per-user RealtimeHub Durable Object
server/lib/             Upstream's src/lib, ported. Alias #lib
server/db/              Drizzle schema (D1 only) and upstream's migrations. Alias #db
server/handlers/        Upstream's API route tree (src/app/api, jmap, mcp, .well-known). Alias #handlers
server/api, server/routes   GENERATED stubs that mount server/handlers. Do not edit; run routes:generate
server/utils/           Nitro auto-imported helpers (defineNextRoute)
scripts/                Generators
```

## How the server works

The server was carried across from upstream nearly unchanged, so [docs/architecture.md](docs/architecture.md)
(upstream's notes) still describes it. What differs:

- **Routes.** Each `server/handlers/**/route.ts` is an upstream Next.js route module
  (`export async function GET(request, { params })`) returning a web `Response`. `defineNextRoute`
  (`server/utils/next-route.ts`) mounts it in Nitro. `#lib/http/next-compat` stands in for the parts of
  `next/server` and `next/headers` the handlers use (`NextResponse.json`, `response.cookies.set`,
  `cookies()`, `headers()`); `cookies()` works through Nitro's async context. A thrown
  `Error("Unauthorized")` becomes a 401. New endpoints may be written as ordinary Nitro handlers
  instead; put them in `server/handlers` with a `route.ts` if you want the same shape, or directly in
  `server/api` if not (a file without the generated marker is never touched by the generator).
- **Env.** `getEnv()` from `#lib/cloudflare` returns the bindings anywhere (requests, queue, cron, email,
  Durable Object). The type is the global `CloudflareEnv` in `shared/types/env.d.ts`. Bindings are
  declared in `nuxt.config.ts` under `nitro.cloudflare.wrangler`; there is no wrangler file in the repo.
- **Database.** D1 only. `getDb(env)` from `#db`. The schema is `server/db/schema/index.ts`, written
  against the SQLite kit in `kits.ts` exactly as upstream writes it. `#db/dialect` always answers
  `"sqlite"`; branches for PostgreSQL and MySQL in ported code are dead and can be deleted when touched.
- **Migrations.** `server/db/migrations/sqlite/*.sql` are upstream's, applied by the in-app runner
  (`#lib/migrations/service`, ledger table `d1_migrations`) from first-run setup and the admin update
  card. A new migration is a new numbered `.sql` file plus `bun run db:bundle`. NuxtHub's own migration
  runner is switched off.
- **Storage.** `env.BUCKET` is the R2 bucket. The Backblaze/S3 swap is gone from the runtime path.
- **Worker entry.** `server/worker.ts` handles `/api/realtime` upgrades, email, queue and cron itself,
  because Nitro's `cloudflare:email` and `cloudflare:queue` hooks run after the handler has returned,
  too late for `setReject()`, `forward()` and per-message ack/retry. Everything else goes to Nitro.
  Nuxt 4.6 uses Nitro 2: there is no `cloudflare_durable` preset in use and no `server.ts` exports
  file (that is Nitro 3). The Durable Object is exported from the custom entry.
- **Not ported, by decision:** the self-hosted Node/Docker runtime, PostgreSQL/MySQL/libSQL, Backblaze
  B2 and S3 storage, Resend and Amazon SES providers, and the Paymug licence gate (branding and other
  licensed features are simply always available).

## Conventions

- Ported server code keeps upstream's style (tabs, double quotes) and file layout so it can be diffed
  against upstream. ESLint ignores those directories. New app code follows the Nuxt ESLint config.
- App code talks to the server through the existing `/api/*` endpoints. Do not change an endpoint's
  request or response shape while porting a page; mobile apps, JMAP and the public API depend on them.
- UI is Nuxt UI v4 components first. Reach for custom markup only where Nuxt UI has nothing suitable.
- Translations: every user-facing string goes through `t()`. Catalogues are `public/locales/*.json`,
  upstream's files and keys unchanged.
- Do not hand-edit generated files: `server/api/**` and `server/routes/**` stubs,
  `server/lib/migrations/bundle.json`, anything in `.nuxt` or `.output`.
