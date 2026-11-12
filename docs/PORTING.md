# Porting Mailflare to Nuxt

The plan, the rules every thread follows, and the status board. Read [CLAUDE.md](../CLAUDE.md) first.

## Where things stand

The foundation is done and deployed at https://mail.flytower.dev (Worker `flytower-mail`, Cloudflare
account Flytower).

- **Server: fully carried across.** All of upstream's `src/lib`, `src/db`, the 87 migrations and the 208
  API route handlers run under Nitro. Checked locally in workerd: migrations through first-run setup,
  sign-in and session cookies, authenticated routes, the realtime Durable Object with session auth, and
  inbound email through the email handler to R2, the queue consumer, parsing, spam scoring and the
  database.
- **App: shell only.** Sign-in page, route guard, translations, the dashboard layout and a placeholder
  inbox. Every other page is still to be ported. That is the bulk of what is left: about 40,000 lines of
  React in `legacy/src/app` and `legacy/src/components` to rewrite in Vue with Nuxt UI.

## Decisions (made by Matt unless marked)

- Open-source fork for Matt's own use. Full feature parity with upstream for users and admins.
- Cloudflare only. Dropped: the Node/Docker runtime, PostgreSQL/MySQL/libSQL, Backblaze B2 and S3,
  Resend and Amazon SES, and the paid licence gate (licensed features are always on).
- Nuxt (latest), Nuxt UI, bun. NuxtHub for the D1/R2/KV wiring.
- Address is https://mail.flytower.dev for good. No rename of the project is needed for now.
- Following upstream afterwards is a manual job; staying diffable with upstream on the server side
  (same file layout, same schema, same migrations) is how that stays cheap.
- The migration should complete without asking Matt anything. Make decisions, record them here.
- (Foundation) The app is a client-rendered SPA (`ssr: false`). It is a signed-in app; this removes a
  class of hydration and browser-API problems from a 40k-line port.
- (Foundation) Translations keep upstream's catalogue format and translator rather than
  `@nuxtjs/i18n`: flat dotted keys, `{var}` interpolation and `.one/.other` plurals do not map cleanly
  onto vue-i18n, and the server uses the same translator for emails and push.
- (Foundation) Sessions keep upstream's database-backed `ep_session` cookie rather than
  `nuxt-auth-utils` sealed cookies, so sign-out-everywhere, device keys, JMAP and the mobile apps keep
  working. `nuxt-auth-utils` is installed but unused; remove it unless a workstream finds a use.
- (Foundation) Upstream's migrations are kept as they are instead of being squashed, so a future
  upstream migration drops straight in.
- (Foundation) Route handlers were moved unchanged behind `defineNextRoute` rather than rewritten as
  idiomatic h3 handlers. Rewriting 208 handlers buys nothing for parity. Rewrite one only when you are
  changing it anyway.

## Rules for every thread

1. **Branch from `nuxt`, PR into `nuxt`.** Name the branch after the workstream (`port/mail-reading`).
   Rebase on `nuxt` before opening the PR and whenever it conflicts.
2. **Merge your own PR** once CI is green (typecheck, lint, test, build) and you have exercised the
   pages in a browser against `bun run preview`. Matt asked for the migration to run without his input,
   so do not wait for review. Squash merge. Small PRs, merged often, beat one large PR: other threads
   are working in the same tree.
3. **Stay in your lane.** Each workstream owns the directories listed for it. If you need a change in
   someone else's (most often a shared component or the layout), make the smallest possible change in
   its own commit and say so in the PR description.
4. **Tick the status board** below in the same PR that lands the work.
5. **Never change API shapes** while porting UI. If an endpoint is wrong, fix the handler in a separate
   PR and note it under Deviations.
6. Every push to `nuxt` deploys to production. There is no real mail on it until cutover, but do not
   push something that does not build.

## How to port a page

1. Find the page in `legacy/src/app/(group)/<path>/page.tsx` and follow its imports into
   `legacy/src/components`. Route groups in parentheses are not part of the URL.
2. Create `app/pages/<path>.vue` (or `<path>/index.vue`) at the **same URL**. Dynamic segments keep
   their names: `[messageId]`.
3. Page meta replaces upstream's `<AuthGuard>` and layout nesting:
   ```ts
   definePageMeta({
     layout: 'dashboard',                 // 'auth' for sign-in style pages, omit for bare public pages
     nav: 'admin',                        // which sidebar: mail (default), admin, settings, calendar, drive
     auth: { role: 'admin', primary: true, feature: 'calendar', requireMailbox: true, mode: 'public' | 'guest' },
   })
   ```
   Map from upstream: `requireRole="admin"` is `role: 'admin'`, `requirePrimary` is `primary: true`,
   `requireFeature` is `feature`, `mode="public"` without `allowAuthenticated` is `mode: 'guest'`, with
   it `mode: 'public'`.
4. Inside the `dashboard` layout a page renders a `UDashboardPanel` with a `UDashboardNavbar` header.
   See `app/pages/inbox/index.vue`.
5. Data: `api<T>(url, { method, body })` from `app/utils/auth-client.ts` (throws `ApiError`), wrapped in
   `useAsyncData` for loads. Use `authFetch` when you need the raw `Response`. Upstream's React Query
   keys and its `window` events (`mailflare:messages-changed` and friends) become composables with
   shared state; keep the event names where other areas listen for them.
6. Strings: `const { t } = useLanguage()`, then `t('some.key', { count })`. Keys are in
   `server/lib/i18n/en.json`. Do not invent keys for strings upstream already has. A genuinely new
   string gets a new key in `en.json` only.
7. Pure helpers that upstream keeps beside components (`*-utils.ts`, `*-types.d.ts`) go in
   `app/utils/<area>/` and `app/types/<area>/`. Helpers already in `server/lib` are imported from
   `#lib/...`; that alias works in app code for files that are free of server-only imports.
8. Components go in `app/components/<area>/`. Nuxt auto-imports them as `<AreaName>`.
9. Nuxt UI first: `UTable`, `UModal`, `USlideover`, `UForm` with zod, `UDropdownMenu`,
   `UCommandPalette`, `UEditor`, `UChat*`, `UCalendar`, `UFileUpload`, `useToast()` in place of
   react-hot-toast. Icons are Lucide (`i-lucide-*`); upstream's icon names in
   `legacy/src/components/icons.tsx` are mostly Lucide-compatible.
10. Check it in a browser: `bun run seed:local`, `bun run build && bun run preview`, sign in as
    `admin@example.test` / `mailflare-dev`. Add or extend a Playwright smoke test in
    `tests/e2e/<area>.spec.ts` (Chromium is preinstalled; the verification workstream sets up the
    runner, until then keep specs self-contained).

## Workstreams

Sizes are lines of upstream React to port. "Owns" lists the directories a thread may freely change.

| # | Workstream | Upstream source | Owns | Size | Depends on |
|---|---|---|---|---|---|
| 1 | **Shell and shared UI** | `components/*.tsx` at the top level (sidebar, nav, mailbox selector, header search, branding and theme, account switcher, loading, new-message popup, PWA service worker), `components/ui`, `components/shortcuts`, `hooks/` (message counts, polling, realtime, app badge), `app/layout.tsx` | `app/layouts`, `app/components/app`, `app/components/nav`, `app/composables` (shared ones), `app/plugins`, `app/app.vue`, `app/assets` | ~8k | none; **start first** |
| 2 | **Sign-in and onboarding** | `app/(auth)`, `components/auth`, `lib/auth/webauthn` browser side | `app/pages/login.vue`, `register`, `setup`, `onboarding`, `forgot-password`, `reset-password`, `app/components/auth` | ~2.5k | none |
| 3 | **Reading mail** | `app/(dashboard)` folder and message pages (inbox, starred, snoozed, sent, scheduled, drafts list, archived, spam, trash, folders), `components/messages`, `components/message-actions`, `components/mail-search`, `components/follow-ups`, the email HTML sanitiser | `app/pages/{inbox,starred,snoozed,sent,scheduled,archived,spam,trash,folders}`, `app/components/messages` | ~8k | 1 for sidebar counts (can start in parallel) |
| 4 | **Composing** | `app/(dashboard)/compose`, `drafts/[messageId]`, `components/compose` (rich text editor, attachments, templates, undo send, read receipts, follow-up bell, AI review) | `app/pages/compose`, `app/pages/drafts/[messageId].vue`, `app/components/compose` | ~3k | none |
| 5 | **Settings: account and security** | `app/(settings)/settings` account, security, api-keys, app-passwords, and the matching parts of `components/settings` (passkeys, MFA, devices, password, profile, language, theme) | `app/pages/settings/{index,account,security,api-keys,app-passwords}`, `app/components/settings/account` | ~3.5k | none |
| 6 | **Settings: mail** | `settings/inbox`, `mailboxes`, `rules`, `auto-reply`, `import`, `export`, `import-export`, `(dashboard)/rules`, `(dashboard)/import-export`, rest of `components/settings` | `app/pages/settings/{inbox,mailboxes,rules,auto-reply,import,export,import-export}`, `app/pages/rules`, `app/pages/import-export`, `app/components/settings/mail` | ~3.5k | none |
| 7 | **Admin: email** | `app/(admin)` mailboxes, domains (the largest single area), routing, webhooks, spam-filter | `app/pages/{mailboxes,domains,routing,webhooks,spam-filter}`, `app/components/admin/email` | ~4.5k | none |
| 8 | **Admin: administration** | `app/(admin)` admin overview, accounts, api-keys, general, agent, ai-usage, activity, audit-logs, backups, branding. The licences page is not ported. | `app/pages/{admin,accounts,api-keys,general,agent,ai-usage,activity,audit-logs,backups,branding}` (admin `agent` settings page only), `app/components/admin/system` | ~3.5k | none |
| 9 | **Calendar and booking** | `app/(calendar)`, `app/book`, `app/c` (public booking pages) | `app/pages/{calendar,booking,book,c}`, `app/components/calendar` | ~2k | none |
| 10 | **Drive, contacts and assistant** | `app/(drive)`, `app/d` (public share page), `components/contacts`, `components/agent`, `(dashboard)/agent` review pages, `use-assistant-availability` | `app/pages/{drive,d}`, `app/pages/agent/{review,calendar-review}`, `app/components/{drive,contacts,agent}` | ~3.5k | none |
| 11 | **Server clean-up and tests** | Remove what the fork dropped and port upstream's unit tests | `server/**`, `shared/**`, `tests/unit`, `scripts`, `.github` | see below | none |
| 12 | **Verification and cutover** | Upstream's Playwright suite and a feature-by-feature check | `tests/e2e`, `docs`, `README.md`, root config | see below | all others |

Admin page URLs have no `/admin` prefix upstream (`/domains`, `/accounts`); keep them. Workstream 8's
admin `agent` page is `/agent`; workstream 10's are `/agent/review/[id]` and `/agent/calendar-review`.

### Workstream 11 in detail

- Delete the Resend and SES providers end to end: `server/lib/aws`, `server/lib/domains/resend-*` and
  `ses-*`, `server/lib/email/provider-intake.ts` and the non-Cloudflare branches of
  `outbound-provider.ts`, `server/handlers/api/inbound/{resend,ses}`, the admin `resend-key` and AWS
  credential endpoints, `domains/[id]/receiving/[provider]`, and the provider columns' UI. Keep the
  database columns (schema stays upstream's); the only valid values become `none` and `cloudflare`.
- Delete Backblaze/S3: `server/lib/storage/b2-*`, simplify `withStorage` callers, keep
  `/api/v1/storage` reporting R2 only.
- Remove the licence gate: make `getLicenseEntitlements` return everything enabled, delete
  `server/lib/licenses` network calls and `server/handlers/api/licenses`. Update the status board note
  for workstreams 1 and 8 (no licence indicator, no licences page).
- Remove dead Node-runtime and dialect branches (`isNodeRuntime`, `schemaDialect() === "mysql"`,
  `server/lib/runtime.ts` once unused, `server/handlers/api/inbound` relay webhook, SMTP notes).
- Self-update: upstream's admin update card dispatches a GitHub workflow that merges upstream. That
  cannot work for a rewritten fork. Keep the pending-migrations half (apply migrations from the admin
  card) and remove the upstream-merge half.
- Remove `nuxt-auth-utils` if still unused. Remove `server/lib/_app` by moving its three files to
  where their users are.
- Port `legacy/tests/*.test.mjs` (about 95 `node:test` files of pure logic) to vitest under
  `tests/unit`, dropping tests for deleted features (`b2-bucket`, `database-dialects`,
  `provider-aws-resend`, `aws-credentials-panel`). Tests for React components wait for the matching UI
  workstream; list them in the status board.
- Turnstile: create a widget for mail.flytower.dev through the Cloudflare API if the connector allows
  it, set `TURNSTILE_SECRET_KEY` and the public site key (runtime config, was
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY`). If not, leave it off; sign-in works without it.
- Web Push needs VAPID keys (`legacy/scripts/generate-vapid-keys.mjs`). Setting Worker secrets needs
  Matt or a token; note it under Open items rather than blocking.

### Workstream 12 in detail

- Port `legacy/tests/e2e` and `legacy/playwright.config.ts` to run against `bun run preview` with the
  local seed.
- Walk `legacy/README.md`, `legacy/docs` and `legacy/changelog` feature by feature and confirm each one
  in the Nuxt app. File gaps back to the owning workstream's thread.
- Check the live deployment at https://mail.flytower.dev. This sandbox's network policy blocks that
  host; the Cloudflare connector can read Worker logs, D1 and build results, and Matt's browser can be
  driven if he has connected it.
- Cutover: delete `legacy/`, write the README, make `nuxt` the default branch (needs Matt, or do it
  through the GitHub API if the token allows), remove the `main` build trigger if any.
- First-run registration on production creates the primary admin and provisions flytower.dev on
  Cloudflare (DNS, Email Routing, sending). It asks for a password, so it is Matt's to do; leave it for
  him and say so in the final hand-off.

## Status board

Tick in the PR that lands it. Add rows for anything discovered.

- [x] Foundation: Worker entry, bindings, server port, migrations, shell, CI, deploy
- [ ] 1 Shell and shared UI
- [ ] 2 Sign-in and onboarding
- [ ] 3 Reading mail
- [ ] 4 Composing
- [ ] 5 Settings: account and security
- [ ] 6 Settings: mail
- [ ] 7 Admin: email
- [ ] 8 Admin: administration
- [x] 9 Calendar and booking
- [ ] 10 Drive, contacts and assistant
- [ ] 11 Server clean-up and tests
- [ ] 12 Verification and cutover

## Deviations from upstream

- `/` redirects to `/inbox` instead of showing upstream's marketing landing page.
- The realtime upgrade, email, queue and cron handlers live in `server/worker.ts`; behaviour is
  upstream's.
- Calendar and booking (/calendar, /booking) use the dashboard layout with `nav: 'calendar'`. The
  upcoming list is its own resizable `UDashboardPanel` on wide screens and a slideover (list button in
  the navbar) below `lg`, instead of upstream's phone-menu drawer. The Bookings/Calendar switch sits
  in the navbar. The booking editor is a `USlideover` rather than an inline side column. Confirmations
  (delete event, delete booking type) still use `window.confirm`, as upstream does.
- The calendar sends invitations from the mailbox selected in the switcher, read from the
  `selected-mailbox-id` localStorage key upstream's MailboxProvider writes (falling back to the
  primary mailbox), via `app/utils/calendar/mailbox.ts`. Switch it to the shell's mailbox composable
  once that exists.
- The passkey setup routes (`/api/auth/passkey/setup/{context,options,verify}`) fall back to the
  HttpOnly `ep_setup` cookie when no `token` is sent. Upstream's server-rendered `/setup/passkey` read
  that cookie and passed it on; the client-rendered page cannot. Requests that send a token are
  unchanged.
- `/api/setup/status` answers `hasAdminAccount: false, hasPrimaryDomain: false` on an empty database
  instead of a 500, so the client-rendered `/login` can send a fresh install to `/setup` as upstream's
  server page did.

## Open items

- Production has no admin yet. First-run registration is left for Matt (see workstream 12).
- `TURNSTILE_SECRET_KEY`, VAPID keys and APNs keys are not set on the Worker. Features that need them
  degrade as upstream's do.
- Email Routing on flytower.dev is not enabled yet; first-run setup enables it through `CF_TOKEN`.

## Cloudflare resources (account Flytower, `e1c19a0c407713eac8c279a4d1d9989b`)

| Binding | Resource |
|---|---|
| `DB` | D1 `mailflare` (`2c5e6a86-7940-44cc-9f11-2dc855d60cd9`) |
| `BUCKET` | R2 `mailflare-raw` |
| `KV`, `CACHE` | KV `mailflare-kv`, `mailflare-cache` |
| `INBOUND_QUEUE`, `OUTBOUND_QUEUE`, `AGENT_QUEUE` | Queues `mailflare-inbound`, `-outbound`, `-agent` |
| `REALTIME` | Durable Object class `RealtimeHub` |
| `AI`, `IMAGES`, `EMAIL` | Workers AI, Images, Email Sending |
| secret `CF_TOKEN` | set by Matt |

Zone: flytower.dev (`f28eb4016b559978567883b01ef25a8a`). Workers Builds trigger
`ed1cc218-0377-4aa4-adae-1fd617f90142`: branch `nuxt`, `bun run build`, `npx wrangler deploy`.

Working with production from a thread, through the Cloudflare connector (`mcp__cloudflare__execute`,
passing the account id):

- **Builds.** Pushes to `nuxt` did not start builds on their own during the foundation work; builds
  were started by hand. After merging, if no build appears within a couple of minutes, start one:
  `POST /accounts/{account}/builds/triggers/{trigger}/builds` with `{ "branch": "nuxt" }`. List them
  with `GET /accounts/{account}/builds/workers/93d684e837b247c89c8c5ca8c32617dc/builds` and read a
  failed build's log at `/accounts/{account}/builds/builds/{build_uuid}/logs`.
- **Logs.** `POST /accounts/{account}/workers/observability/telemetry/query` filtered on
  `$metadata.service = flytower-mail` shows requests, cron runs and errors. This is the way to check the
  live Worker, since the sandbox cannot open mail.flytower.dev.
- **Data.** D1 can be queried through the connector. Read only, unless the work calls for a change.

Until first-run setup has been completed on production, the five-minute cron logs "Failed query"
errors because the tables do not exist yet. That is expected.
