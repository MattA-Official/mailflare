# Deployment and configuration

This fork runs as one Cloudflare Worker, `flytower-mail`, on the Flytower account, served at
https://mail.flytower.dev. Everything it uses lives on Cloudflare: D1, R2, KV, Queues, a Durable
Object, Workers AI, Images, Email Routing and Email Sending.

## How it deploys

Workers Builds watches this repository. Every push to `nuxt` runs `bun run build` and
`npx wrangler deploy`; nobody deploys by hand. Pushes to any other branch build a
[Worker Preview](https://developers.cloudflare.com/workers/previews/) with `wrangler preview`,
bound to preview-only resources (D1 `mailflare-preview`, R2 `mailflare-preview`, KV
`mailflare-preview-kv` and `-cache`, queues `mailflare-preview-*`) so a branch never touches
production. Previews have no `CF_TOKEN` and no send binding, so they cannot run setup or send mail;
the build is the useful check.

The Wrangler configuration is generated from `nuxt.config.ts` (`nitro.cloudflare.wrangler`) into
`.output/server/wrangler.json` at build time. Bindings, cron triggers, queues, routes and the
preview block are all declared there.

| Binding | Resource |
| --- | --- |
| `DB` | D1 `mailflare` |
| `BUCKET` | R2 `mailflare-raw` |
| `KV`, `CACHE` | KV `mailflare-kv`, `mailflare-cache` |
| `INBOUND_QUEUE`, `OUTBOUND_QUEUE`, `AGENT_QUEUE` | Queues `mailflare-inbound`, `-outbound`, `-agent` |
| `REALTIME` | Durable Object class `RealtimeHub` |
| `AI`, `IMAGES`, `EMAIL` | Workers AI, Images, Email Sending |
| `WORKER_SELF_REFERENCE` | Service binding to the Worker itself |

Crons: `*/5 * * * *` (follow-ups, calendar reminders, import sweeps, assistant recovery) and
`0 2 * * *` (backups and daily maintenance).

The Worker name appears three times in `nuxt.config.ts` and they must agree: the Worker `name`, the
`CF_EMAIL_WORKER_NAME` variable (Email Routing rules deliver to it) and the
`WORKER_SELF_REFERENCE` service.

## Secrets and variables

Set secrets with `bunx wrangler secret put <NAME>` or in the dashboard under the Worker's
**Settings → Variables and Secrets**.

### `CF_TOKEN`

Required. A Cloudflare API token Mailflare uses at runtime to manage DNS, Email Routing and
Email Sending for your domains. It is not the Workers Builds token. Create it under **Manage
Account → Account API Tokens**:

1. A policy for **Specified zones** (every domain you will connect) with:
   - DNS & Zones → DNS: **Edit** (also lets the confirmed setup flow replace conflicting MX records)
   - DNS & Zones → Zone: **Read**
   - DNS & Zones → Zone Settings: **Edit**
   - Email & Messaging → Email Routing Rules: **Edit**
2. A policy for the **Entire account** with Email & Messaging → Email Sending: **Edit**, if
   Mailflare will send mail. Sending needs the Workers Paid plan.

Paste only the token secret: no `Bearer`, not the token id.

### Optional

| Name | Kind | What it turns on |
| --- | --- | --- |
| `TURNSTILE_SECRET_KEY` | secret | Turnstile checks on sign-in, setup and password reset |
| `NUXT_PUBLIC_TURNSTILE_SITE_KEY` | variable | The matching site key shown in the browser |
| `VAPID_PRIVATE_KEY` | secret | Web Push (new mail and calendar reminders) |
| `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT` | variables | Web Push; the subject is a `mailto:` URI or `https://mail.flytower.dev` |
| `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY` | secrets | Native push to the iOS app straight to Apple |
| `APNS_RELAY_URL` | variable | Native push through a relay instead |
| `SPAMHAUS_DQS_KEY`, `ABUSECH_AUTH_KEY` | secrets | Spam lookups (also settable under Admin → Spam filter) |

Generate VAPID keys once with `bun run vapid:generate` and keep them: changing them invalidates
every browser's push subscription. Variables set in the dashboard are overwritten by the next
deploy unless they are also in `nuxt.config.ts` `vars`, so set the public ones there or as
secrets.

## First-run setup

1. Open https://mail.flytower.dev. A fresh database sends you to `/setup`.
2. Setup checks the configuration, applies the bundled migrations to the empty D1 database and
   asks for the first administrator's name, email and password.
3. Connect the primary domain (flytower.dev). Mailflare enables Email Routing, points the zone's
   catch-all at this Worker, configures sending DNS and creates the first mailbox.
4. Send a test message to the new address.

To connect more domains later, open **Admin → Domains → New domain**.

## Database migrations

Upstream's migrations live in `server/db/migrations/sqlite` and are bundled into the Worker
(`bun run db:bundle`, run by every build). Setup applies them to an empty database. After a deploy
that adds a migration, open **Admin** and apply pending migrations from the database card. Nothing
applies migrations automatically.

## Backups

Mailflare exports its D1 records as JSON into R2. The 02:00 UTC cron applies the schedule chosen
under **Admin → Backups**; manual backups and restores are on the same page.

## Email assistant and MCP

The assistant uses the `AI` binding and the `mailflare-agent` queue; configure providers and models
under **Admin → Agent**. See [Email assistant and MCP](email-assistant-and-mcp.md).

## Local development

```bash
bun install
bun run seed:local        # local D1 with admin@example.test / mailflare-dev
bun run dev               # Nuxt dev server; no queues, email handler, cron or Durable Object
bun run build && bun run preview   # the real Worker in workerd on http://localhost:8787
```

In `bun run preview`, deliver a test email by posting raw MIME to
`/cdn-cgi/handler/email?from=..&to=..` and run a cron with `/__scheduled?cron=*/5+*+*+*+*`.

Checks: `bun run typecheck`, `bun run lint`, `bun run test` (vitest) and `bun run test:e2e`
(Playwright against `bun run preview`; build first). CI runs the first four on every pull request.

## Following upstream

This fork is a rewrite of upstream's UI, so upstream changes are ported by hand. The server side
keeps upstream's layout (`server/lib` is `src/lib`, `server/handlers` is `src/app/api`, the same
schema and migrations) so a server change usually applies directly; new migrations drop into
`server/db/migrations/sqlite`.
