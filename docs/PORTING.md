# Porting Mailflare to Nuxt

The plan, the rules every thread follows, and the status board. Read [CLAUDE.md](../CLAUDE.md) first.

## Where things stand

The port is complete and deployed at https://mail.flytower.dev (Worker `flytower-mail`, Cloudflare
account Flytower). Every workstream below is ticked. `legacy/` (upstream's Next.js app at v0.5.4) was
deleted at cutover; it remains at `cee65a5`, on the `upstream` branch (upstream's `main`, synced daily) and at https://github.com/hieunc229/mailflare, and
paths below that start `legacy/` mean upstream's tree. `nuxt` is the default branch.

## Decisions (made by Matt unless marked)

- Open-source fork for Matt's own use. Full feature parity with upstream for users and admins.
- Cloudflare only. Dropped: the Node/Docker runtime, PostgreSQL/MySQL/libSQL, Backblaze B2 and S3,
  Resend and Amazon SES, and the paid licence gate (licensed features are always on).
- Nuxt (latest), Nuxt UI, bun. NuxtHub for the D1/R2/KV wiring.
- Address is https://mail.flytower.dev for good. No rename of the project is needed for now.
- Upstream is followed daily (Matt, 2026-11-12): see "Following upstream" below. Staying diffable
  with upstream on the server side (same file layout, same schema, same migrations) is what keeps that
  cheap. Staying merge-compatible with upstream's git history is not needed.
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
- (Composing) The composer keeps upstream's contentEditable editor (`ComposeRichTextEditor`) rather than
  Nuxt UI's `UEditor`: TipTap's schema would drop the `data-mailflare-signature` and quote markers the
  signature swap and quote folding rely on, and would rewrite arbitrary email HTML in loaded drafts.
- (Composing) The composer's own validation errors use Nuxt UI toasts (`useToast`); the send toast with
  the undo countdown and subject link stays custom (`ComposeNoticeToast`), as upstream's was.

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
- [x] 1 Shell and shared UI
- [x] 2 Sign-in and onboarding: login (password, TOTP/recovery code, passkey, passkey second factor,
  `?add=1`), first-run setup, onboarding, passkey setup links, forgot and reset password.
  `tests/e2e/auth.spec.ts`. Passkey ceremonies use `APP_URL` as the RP ID; local preview sets it to
  http://localhost:8787 (workstream 12), so they complete there too.
- [x] 3 Reading mail: every folder list and reader, custom folders, the drafts list, the split view, bulk and row actions, swipe on phones, follow-ups, the HTML renderer. Shared for others: `MessagesFolderPage` + `~/utils/messages/folder-configs`, `MessagesEmailHtmlRenderer`, `useConversationView` / `useTwoColumnReading` / `useLatestMessagesFirst` / `useShowFullRecipientAddresses` in `app/composables/messages` (for settings). Unit tests for `app/utils/messages` are left to 11
- [x] 4 Composing (`useCompose()` and `<ComposeHost>` in the dashboard layout; shared: `ComposeFollowUpMenu`, `ComposeScheduleSendSheet`, `~/utils/compose/*`)
- [x] 5 Settings: account and security
- [x] 6 Settings: mail
- [x] 7 Admin: email
- [x] 8 Admin: administration
- [x] 9 Calendar and booking
- [x] 10 Drive, contacts and assistant
- [x] 11 Server clean-up and tests
  - [x] Licence gate, Resend, SES, B2/S3, Node runtime, other dialects, self-update merge removed
  - [x] Unit tests ported: `legacy/tests/*.test.mjs` run under vitest as `tests/unit/*.test.mjs`
    (upstream's style, lint-ignored like other ported code). Helpers in `tests/unit/helpers` stand in
    for `better-sqlite3` and D1 (over `node:sqlite`), `cloudflare:workers` and `useEvent`; bundling
    tests go through `helpers/esbuild.mjs` so `#lib`, `#db`, `#handlers` and `~` resolve. Tests for
    deleted features were dropped, and assertions about the licence gate now assert there is none.
  - [x] UI test ports: upstream's component tests rewritten in vitest against the Vue code (same file
    names under `tests/unit`). App modules are bundled with esbuild and Nuxt's auto-imports are
    provided on `globalThis`; components are compiled with `vue/compiler-sfc` and mounted in jsdom
    with Nuxt UI stubbed (`tests/unit/helpers/app-module.mjs`). Changed or dropped on purpose:
    - `landing-account-auth`: dropped, `/` redirects to `/inbox` and there is no landing page.
    - `layout-mail-search-provider`: the provider checks are moot (search state is module level with no
      provider); only "useMailSearch works anywhere" and the debounce are kept.
    - `i18n`: the React provider, selector and SSR layout cases became `i18n-language.test.mjs`
      (`useLanguage` sets `<html lang dir>` on the client; the app does not server-render).
    - `message-selection-navigation`: mounts the real `MessagesSplitLayout` with the list, routed page
      and bulk bar stubbed, so it covers the layout owning selection and page, not the list rendering.
    - `domain-add-retry`: MX replacement is confirmed through a callback (a dialog) instead of
      `window.confirm`, and declining resolves null instead of throwing; the prompt-text cases are gone.
    - `compose-ai-review-behavior`: also edits the form while the review is open, since the port has
      nothing else that would trigger an autosave there.
    - `avatar-preview-skip`: moot, the progressive avatar is not ported.
- [x] 12 Verification and cutover
  - [x] Workers Builds previews: `previews` block against preview-only D1/R2/KV/queues
  - [x] Setup fix: Email Routing rules now target `CF_EMAIL_WORKER_NAME` (upstream hard-coded `mailflare`)
  - [x] e2e: Playwright runner (`bun run test:e2e`, CI job `e2e`), upstream's passkeys suite ported
    (`tests/e2e/passkeys.spec.ts`, its own account reset through the local D1), a sweep of every
    signed-in page for errors, 5xx and CSP violations (`tests/e2e/pages.spec.ts`)
  - [x] Parity walk (pages, API routes, lib, public files, scripts, docs, changelog): fixed missing
    security headers, leftover licence/Docker/Resend copy, Cancel focus on passkey removal; ported
    the recovery-link, VAPID and Takeout scripts; user docs moved to `docs/`
  - [x] Deleted `legacy/` after the UI test ports landed; `nuxt` is the default branch

## Shell conventions (workstream 1)

- The account and mailbox menu (`AppMailboxSelector`) sits in the sidebar footer instead of a header bar
  at the top right; there is no layout-wide header. Pages put `<AppNavbar :title search>` in their
  `UDashboardPanel` header: it adds the sidebar toggle, and with `search` the mail search box
  (`AppHeaderSearch`, bound to `useMailSearch`) and the DNS-skipped banner.
- `nav: 'settings'` shows the settings sections in the sidebar (upstream showed the mail sidebar plus a
  settings column), so settings pages need no navigation of their own. `nav: 'calendar'` and `'drive'`
  show app links plus a `#app-sidebar-extra` teleport target; workstream 10 adds `DriveNav` for drive.
- Shared client state: `useSelectedMailbox`, `useMessages`, `useMessageCounts`, `useMailSearch`,
  `useBranding`, `useShortcuts` / `useHotkeys`, with caches in `app/utils/messages`,
  `app/utils/folders/client.ts` and types in `app/types`. Page shortcuts go through
  `useShortcuts().registerShortcut` so they appear in the cheat sheet.
- The new-message popup is a Nuxt UI toast. Realtime, the session reset and service worker
  registration are client plugins.
- Mail sidebar rows reorder by press and hold (`NavReorderableList`, upstream's storage keys
  `mailflare:nav:layout` and `mailflare:nav:layout:folders`), including moving rows in and out of
  "More...". Reordering is off in the collapsed icon rail.
- Attachment card and viewer and the previous-message block belong to workstream 3
  (`app/components/messages`). Upstream's progressive avatar is not ported: `UAvatar` already shows a
  fallback until the image loads.

## Deviations from upstream

- (fork) Drizzle 1.0 (Matt, 2026-11-15), while upstream stays on 0.x. Migrations are in Drizzle Kit
  1.0's folder layout: `server/db/migrations/sqlite/<name>/migration.sql`, configured by
  `drizzle.config.ts`. Write migrations with Drizzle Kit, not by hand (Matt): change the schema, run
  `bun run db:generate -- --name <what>` (a folder named `<timestamp>_<what>`, which sorts after the
  numbered ones), then `bun run db:bundle`. `bun run db:check` checks the folder and shows any
  ungenerated change. Hand-written SQL only where Drizzle Kit cannot express it (data moves, FTS,
  triggers): `bun run db:generate -- --custom --name <what>` makes an empty migration with the right
  snapshot.
  - The in-app runner, the bundle and `bun run seed:local` record each folder as `<name>.sql` in
    `d1_migrations`, the name it had as a flat file, so databases migrated before the move (production
    was at 0095) see nothing new. The generated `bundle.json` was byte-for-byte unchanged by the move.
  - `drizzle-kit up` could not do the move itself: it needs a 0.x snapshot for every journal entry
    and upstream kept only three (0000, 0010, 0080), the fork's hand-written 0087_oidc_provider and
    0088-0095 were never in the journal, and it renames folders to timestamps, which would have made
    the runner apply everything again. The files were moved by `git mv` instead, and the one
    snapshot (in `0095_mailbox_managers/`) is Drizzle Kit's own snapshot of the schema at that point.
  - Known differences between the schema and the SQL the migrations ran, kept as they were: the
    `messages_fts` tables (raw SQL, not in the schema); `users.kind` and `users_kind_idx` (declared in
    `server/lib/accounts/kind.ts` on purpose); `groups_name_idx` and
    `idx_api_keys_prefix` exist only in SQL; defaults of `backup_settings.enabled` (SQL false, schema
    true) and `mailbox_agent_settings.enabled` (SQL true, schema false); some unique constraints are
    named indexes in SQL. Drizzle Kit diffs against the schema snapshot, so none of these produce a
    migration unless the schema changes there.

- (11) No licences. `/api/licenses/*` is gone, there is no licence indicator (workstream 1) and no
  licences page (workstream 8). Every licensed feature is on: `canForwardEmail`, `canCreateShared` and
  `canManageHosts` are always true for those who would have had them with a Team licence, and
  `GET /api/accounts` returns `seats: { limit: null, used }` (unlimited).
- (11) Cloudflare is the only mail provider. `/api/domains/{id}/sending` and `/receiving` accept
  `none | cloudflare`; their GET responses are `{ cloudflare: boolean }` (upstream also returned
  resend/ses keys). `POST /api/domains/{id}/receiving/cloudflare` sets up Email Routing (409
  `MX_CONFLICT` as before); its GET and other providers are gone. Removed endpoints:
  `/api/domains/{id}/resend`, `/api/domains/{id}/ses`, `/api/admin/aws`, `/api/admin/resend-key`,
  `/api/inbound`, `/api/inbound/resend`, `/api/inbound/ses`. The schema keeps upstream's
  `sending_provider`/`receiving_provider` enums.
- (Fork) Upstream added the **Anthropic** assistant provider in `5e0dfa6` (#287), replacing the fork's own
  (which also added 8,000 tokens of thinking room per call). The port takes upstream's code, except that
  the model list sends the key as `x-api-key` instead of a bearer token (`provider-models.ts`).
- (11) `/api/v1/storage` always reports `{ provider: "r2", configured: true, bucket: null, endpoint: null }`.
- (11) `/api/admin/update` is gone: the admin update card shows only pending migrations
  (`/api/admin/migrations`), since upstream's "merge upstream" workflow cannot apply to this fork.
- (12) Upstream's security headers (`getSecurityHeaders`: CSP without `unsafe-eval`, HSTS, COOP,
  frame, referrer and permissions policy, `X-Robots-Tag`) are applied to every response through
  `routeRules` in `nuxt.config.ts`; they were missing from the port.
- (12) Five strings that mentioned licences, Docker or Resend/SES (`admin.section.accounts`,
  `update.description`, `domains.descriptionManaged`, `adminKeys.perm.accountsDesc`,
  `adminKeys.perm.storageDesc`) were reworded in English; the other catalogues carry the English
  text for those keys until someone translates them.
- (12) `bun run auth:recovery-link` prints the D1 statements and link only (there is no
  `DATABASE_URL` path). `bun run preview` sets `APP_URL` to http://localhost:8787 so passkeys work
  locally.
- (11) `server/lib/_app` moved: `hooks-types` is `#lib/messages/message-types`,
  `email-html-sanitizer-types` is `#lib/email/html-types`, `rich-text-utils` is
  `#lib/compose/rich-text-utils`, and the `email-html-sanitizer` re-export is gone (use
  `sanitizeEmailHtml` from `#lib/email/html`).

- (3) Every folder route is a parent page (`inbox.vue`) rendering `MessagesSplitLayout`, with
  `index.vue` (the full list) and `[messageId].vue` (the reader) as children. In the split view the
  list is a resizable `UDashboardPanel` (`id="message-list"`) whose width the dashboard group stores,
  instead of upstream's per-user saved column width. Below `lg` the reader is single column with a
  back arrow, as when two-column reading is off.
- (3) Hovering a row warms the message detail cache only; there is no route payload to prefetch.
- (3) The "assistant open" state the reader reads is a placeholder (`useAssistantOpenState()` in
  `app/composables/messages/useMessageListContext.ts`, always false) until workstream 10 provides
  the assistant panel; swap it there.
- (3) Confirmations (delete forever, empty Trash/Spam, trash without unsubscribing) still use
  `window.confirm`, as upstream does. The scheduled-send banner reschedules from one popover on every
  screen size.

- (6) Settings → Inbox → Automatic response: the Save button also shows when the reply has just been
  switched off, so turning it off can be saved (upstream hid the button with the fields).
- `/` redirects to `/inbox` instead of showing upstream's marketing landing page.
- The realtime upgrade, email, queue and cron handlers live in `server/worker.ts`; behaviour is
  upstream's.
- (8) The admin overview's update card keeps only the database half (pending migrations). The
  upstream-merge half dispatched a GitHub workflow that cannot work for a rewritten fork.
- (8) No licence overlay or seat counter on /accounts, no licence-required state on /branding and no
  licences card on /admin: the fork has no licence gate.
- (8) /accounts/[id] is a parent route with Details, Password, Permissions and Mailboxes tabs in the
  panel toolbar, instead of upstream's side menu. The admin assistant page is `pages/agent/index.vue`
  so the review pages under /agent/* stay siblings, not children.
- (8) Browser `confirm()` prompts (revoke API key, restore backup) are Nuxt UI modals.
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
- (Workstream 2) Auth pages use `layout: false` and their own two-panel `AuthShell`, as upstream did,
  rather than the shared `auth` layout. `/setup`'s server-side branching (register, onboarding or
  redirect) is a page middleware over `/api/setup/status` and `/api/auth/me`.
- (Workstream 2) The Turnstile site key is runtime config `public.turnstile.siteKey`
  (`NUXT_PUBLIC_TURNSTILE_SITE_KEY` on the Worker) in place of `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. The
  widget is rendered by `@nuxtjs/turnstile` (wrapped by `AuthTurnstile`) rather than a hand-loaded script.
- `/api/setup/status` answers `hasAdminAccount: false, hasPrimaryDomain: false` on an empty database
  instead of a 500, so the client-rendered `/login` can send a fresh install to `/setup` as upstream's
  server page did.

- Admin email (7): the Domains page offers only Cloudflare and "not selected" for sending and receiving.
  Confirmations use a Nuxt UI modal (`useAdminConfirm`) instead of `window.confirm`/`prompt`; removing a
  domain still requires typing its hostname. The mailbox pages dispatch `mailflare:mailboxes-changed`
  instead of calling the selector's cache directly. Routing rule validation errors show the server's
  field messages instead of "Request failed".
- Settings (workstream 5): signing out a mobile device and revoking an API key confirm in a modal
  instead of `window.confirm`. The MFA QR code is rendered with qrcode's core and SVG renderer
  (`server/lib/auth/qr-svg.ts`) because its PNG renderer cannot load on Workers.

- (10) Drive uploads: `PUT /api/drive/upload/{id}` pipes the request body through a
  `FixedLengthStream` before `uploadPart`, because R2 rejects the stream Nitro hands the handler
  ("Provided readable stream must have a known length"). Request and response shapes are unchanged.
- (10) The email assistant is `AgentAside` (mounted in the dashboard layout) with its toggle in
  `AppNavbar`, shown only in the mail and calendar sections (`nav: 'mail' | 'calendar'`), as upstream
  showed it only beside mail and calendar. State lives in `useAssistant()`, which replaces
  `use-assistant-availability`; upstream's localStorage keys are kept. Assistant replies render
  through `marked` + DOMPurify with raw HTML and images dropped.
- (10) `ContactsContactAvatar` is a plain `<img>` with an initials fallback rather than upstream's
  progressive avatar, matching the shell's decision for `UAvatar`.
- (fork) Mailflare is an OpenID Connect provider for staff apps: migration `0087_oidc_provider`
  (tables `oidc_*` and `sessions.amr`), `server/lib/oidc`, `server/handlers/oauth`,
  `/.well-known/openid-configuration`, the Apps admin pages and an Apps tab on accounts. Upstream has
  none of this, so it never conflicts with a port. `completeLogin` takes the sign-in method (`amr`)
  and `/login` accepts `?next=/oauth/authorize?…`. See [oidc.md](oidc.md).
- (fork) Flytower branding: `primary: 'tungsten'`, `neutral: 'steel'` and IBM Plex in `app.config.ts` and
  `main.css`; the Flytower mark as `favicon.ico`, `favicon.svg` and `icon-*.png`; the default name is
  "Flytower Mail" (`DEFAULT_APP_NAME`, `DEFAULT_BRANDING`, the manifest) and migration
  `0088_flytower_app_name` renames installs still called "Mailflare". "Powered by Mailflare" stays.
- (upstream f4a17bd) Upstream's splash screen is not carried across (the Nuxt app has no first-paint
  splash), nor its `changelog/` entries or version bump. The Contacts page is also linked from the
  `NavApps` sidebar, not only the new apps menu. `tests/unit/message-actions-overflow.test.mjs`
  expects the 17px group divider upstream's a2a75fd introduced; upstream left its own test on 1px.
- (fork) Groups of accounts, phase 1 of the plan Matt approved on 14 Nov 2026 (groups within one
  instance, not separate workspaces). Migration `0089_groups` adds `groups`, `group_members` and
  `mailbox_group_access`; upstream's `mailbox_access` is untouched. `#lib/mailboxes/access` gives a
  member the highest of their direct grant and every group grant, for shared inboxes only, and
  `listSharedMailboxUserIds` feeds realtime and push. APIs: `/api/groups`, `/api/groups/[id]`,
  `/api/groups/[id]/members`, `/api/mailboxes/[id]/group-access`. Pages `/groups` and `/groups/[id]`; the
  Shared access card offers groups and people in one picker. Two behaviour changes from upstream: any
  admin with `canManageMailboxes` or `canManageUsers` (and the primary admin) manages any shared inbox's
  access and settings, not only the admin who owns it (`#lib/groups/permissions`); and every enabled
  account except the owner can be given a shared inbox, not only accounts the acting admin created.
  Creating and editing groups needs `canManageUsers`; any admin can read them. `group_members.role`
  (`member` / `manager`) is in place for delegated management, which is phase 2.
- (fork) Groups, phase 2. A group's managers (`group_members.role = 'manager'`, any account) add and
  remove ordinary members; only `canManageUsers` admins promote or remove managers
  (`authorizeGroupAccess` in `#lib/groups/admin`). Settings → Groups (`/settings/groups`, backed by
  `/api/groups/mine`) lets any account see its groups and, as a manager, edit membership. The Shared
  access card has a "Who has access" panel (`/api/mailboxes/[id]/access-summary`) that shows each
  person's effective permission and the routes that give it. Migration `0090_drive_group_shares` adds
  `drive_group_shares`; `#lib/drive/access` folds group shares into roles, "Shared with me" and the
  shared flag. The share dialog's GET response gains `groupShares` and `availableGroups` (additive).
- (fork) Groups, phase 3. A shared inbox can be owned by a group (migration `0091_mailbox_owner_groups`,
  `#lib/groups/ownership`, `PUT/DELETE /api/mailboxes/[id]/owner-group`). The owning group always holds a
  `full_access` row in `mailbox_group_access`, so the access resolver is unchanged; that row cannot be
  downgraded or removed while the group owns the inbox. When accounts are deleted, and again before they
  are purged, group-owned inboxes they hold move to the primary admin (audit `mailbox.owner_moved`)
  instead of going with the account. An inbox on a domain owned by a deleted account still goes with
  that domain.
- (fork) Nested groups. Migration `0092_group_subgroups` links groups as parent and sub-group, many to
  many (`#lib/groups/hierarchy`, `POST/DELETE /api/groups/[id]/subgroups`, admins who manage groups only).
  A grant to a group, for shared inboxes and Drive, reaches the members of every group beneath it at the
  same level; nothing flows up. The resolver uses recursive CTEs over `group_subgroups`. Links that
  would loop are refused, and deleting a group or removing a link only ends what passed through it.
- (fork) Standalone shared inboxes, phase 1 of the plan Matt approved on 14 Nov 2026. Each shared inbox is
  held by a hidden account of its own (`users.kind = 'inbox'`, id `inbox_<mailbox id>`, email
  `<mailbox id>@inbox.invalid`, passwordless) instead of the admin who created it
  (`#lib/mailboxes/principals`). Upstream keys stored mail, folders, contacts and mail settings by user id,
  so those now belong to the inbox with no query changes. People reach a shared inbox only through grants;
  its creator gets `full_access`. Migration `0093_inbox_principals` adds `users.kind` and converts existing
  shared inboxes in SQL: a holder per inbox carrying the admin's spam, trash and remote-content settings,
  a `full_access` grant for the admin, the admin's blocked and remote-content-allowed contacts copied,
  and inbound mail and folders re-keyed (drafts and sent mail stay with their author, as for any grantee).
  Hidden accounts are refused by sessions, sign-in, API and MCP keys, and left out of account lists, seat
  counts, group and inbox pickers, Drive shares, the who-has-access list and account deletion
  (`#lib/accounts/kind`). Any kind other than `person` is treated as hidden. `users.kind` is deliberately
  not in the Drizzle `users` table: `#lib/accounts/kind` maps it on its own and treats a database without the
  column as all people, so sign-in and the update card keep working until 0093 is applied. Deleting a shared inbox
  (admins who manage shared inboxes) removes its routing, disables it and marks its holder deleted, so the
  account purge clears its mail and R2 objects after the restore window. Invites and webhooks for a shared
  inbox now go to the inbox's own account, not the admin's.
- (fork) Standalone shared inboxes, phase 2. Deleting an admin who owns domains is refused (409) unless the
  same request transfers their data to an admin who manages domains, who then takes over those domains, so
  the purge no longer cascades to every mailbox on them. `GET /api/accounts` gains `ownedDomains` per
  account (additive) and the delete dialog requires such a recipient when any are listed. Deleting a domain
  that hosts an enabled shared inbox is refused (409) with the inbox addresses.
- (fork) Standalone shared inboxes, phase 3. Groups manage a shared inbox instead of owning it: migration
  `0095_mailbox_managers` replaces `mailbox_owner_groups` (rows copied), any number of groups per inbox
  (`#lib/groups/managers`, `POST/DELETE /api/mailboxes/[id]/managers` replacing `owner-group`). A managing
  group keeps a `full_access` grant that cannot be lowered or removed while it manages. `group-access` returns
  `managerGroupIds`, the access summary `managesInbox`, the group page `managed`. Anyone with full access to a
  shared inbox, not only admins, may now manage who has it (`getSharedMailboxForManager`). Admin → Shared
  inboxes (`/shared-inboxes`, `GET /api/shared-inboxes`) lists every shared inbox for admins who manage them,
  and `POST /api/shared-inboxes/[id]/restore` brings back a deleted one before its holder is purged.
  `moveGroupOwnedMailboxes` is gone: inboxes no longer belong to a person.
- (fork) Standalone shared inboxes, phase 4. A shared inbox's mailbox page has an Inbox settings card
  (`GET/PATCH /api/mailboxes/[id]/inbox-settings`, `{ spamProtectionEnabled, trashRetentionDays }`) that
  writes to its hidden account, because inbound spam checks read the mailbox holder and trash retention runs
  per message owner. Anyone who can configure the mailbox may change them; read-only access sees them.
  Renaming a shared inbox also renames its hidden account. Remote-content and other reading preferences
  stay per reader, and saving an attachment to Drive always puts it in the saver's own Drive.
- (fork) Shared drives, phase 1 of the plan Matt approved on 14 Nov 2026. A shared drive is a Drive tree
  held by a hidden account of its own (`users.kind = 'drive'`, id `drive_<nanoid>`, email
  `<id>@drive.invalid`, passwordless), so it belongs to nobody and survives every person
  (`#lib/drive/shared-drives`). Migration `0094_shared_drives` adds `shared_drives` (the drive's own
  storage cap, null for unlimited, admins only) and `drive_members` (a person or a group at `view`, `edit`
  or `manage`; nested groups count, downwards only). Every item in a drive is owned by its account, so
  uploads, previews, links and R2 keys are unchanged; `getDriveRole` adds the drive's members, and Manage
  is reported as role `"owner"` so clients keep their meaning. Owner-only checks (restore, delete for
  good, share, link, move) now ask for role `"owner"` rather than `owner_id`, which is the same thing for
  a person. Only admins who manage users create drives, and they manage every drive. A drive keeps at
  least one Manage member. Deleting a drive soft-deletes its account; the account purge removes its files
  after the restore window. `/api/drives`, `/api/drives/[id]` and `/api/drives/[id]/members` are new;
  `/api/drive/items` and `/api/drive/upload` take an optional `driveId` and listings gain an optional
  `drive` (additive). Until 0094 is applied the shared drive tables read as empty, so Drive works as before.
- (fork) Shared drives, phase 2. Items move between My Drive and shared drives with the bulk `move`
  action (new optional `driveId` for the top of a drive): editors move within a drive and into it, only the
  owner (a drive's managers) moves items out of a tree, and moving hands the whole subtree to the
  destination's account after checking its storage cap. File rows pin their `r2_key` before the owner
  changes, so nothing is copied in R2. `/api/drive/folders?drive=` lists a drive's folders, save-to-drive
  takes `{ driveId }`, and Admin → Shared drives (`/api/shared-drives`, `/api/shared-drives/[id]/restore`)
  lists every drive, deleted ones too, with restore inside the purge window.
- (upstream 2b58ed7) Upstream's `0087_message_invite_response` shares its number with the fork's
  `0087_oidc_provider`. The runner records migrations by full file name, so both apply; keep
  upstream's file names as they are rather than renumbering.
- (fork) UI consistency pass. Every signed-in page header is `AppNavbar`, so the assistant toggle and
  apps menu are on admin, Drive, Calendar and Compose pages too (upstream has them on mail pages only).
  Admin pages centre their column like settings pages. The phone Compose button is hidden on `/compose`,
  and mail lists leave room under it. Sent's empty state uses the new English-only key
  `folder.empty.sent` ("No sent emails") instead of reusing the inbox's "No emails".
- (fork) One page layout. List, admin and settings pages render through `AppPage`
  (`app/components/app/Page.vue`): title and main "New …" button in the header, an optional one-line
  description, then a centred column. `AdminSystemPage` and `SettingsMailSettingsPage` wrap it. The New
  mailbox and New API key buttons moved from the page body to the header (the dialogs open through a
  `createOpen` model), and Contacts and Bookings lost their second, larger page title.
- (fork) Detail pages on the standard layout too: a mailbox's page is titled with its address and has a
  back button to Mailboxes (the address line above the cards is gone; the Shared and Primary badges
  stay), Settings → Account and a group's settings page use `AppPage`, and Compose centres its form.
  Page-level load errors on these pages are a `UAlert`.

## Following upstream

Last ported upstream commit: `f4a17bd` fix: sync package-lock.json for npm 10 (#301) (2026-11-14)
<!-- upstream-ported: f4a17bd98d8ad9dbcf95be911ac21cea1e471d91 -->

The marker above is the last commit of hieunc229/mailflare's `main` whose changes are in `nuxt`. The
port started from `cee65a5` (v0.5.4, the tree that was `legacy/`). Read upstream's current source from the `upstream` branch or with
`git show origin/upstream:<path>`.

- **`upstream` branch.** `.github/workflows/sync-upstream.yml` fast-forwards it to upstream's `main`
  every day at 05:17 UTC (and on demand from the Actions tab), and its summary says how many commits
  are unported. If upstream ever changes its own `.github/workflows`, the default token cannot push
  that; add a fine-grained token with Contents and Workflows write as the `UPSTREAM_SYNC_TOKEN` secret.
- **Porting.** A daily Claude routine ports what is new, in one PR into `nuxt`, and merges it on green
  CI. By hand it goes:
  1. `node scripts/upstream/port.mjs status` lists the unported commits and sorts the changed files
     into those carried across mechanically, those to port by hand (the React UI and the Worker entry),
     those the fork deleted on purpose, and those ignored (other dialects, Docker, the Node runtime,
     upstream's lockfile and CI).
  2. `node scripts/upstream/port.mjs apply` carries the server side across with a three-way merge:
     paths mapped onto this tree, `@/` imports rewritten to `#lib`/`#db`/`#handlers`, new tests turned
     into vitest (`scripts/upstream/port-test.mjs`), migration bundle and route stubs regenerated.
     Conflicts are left as markers; most are import lines, where upstream's side with our aliases wins.
     Code for dropped features (other databases, `getNodeEnv`, `withDatabase`, `withStorage`, Resend,
     SES, S3, the licence gate) is removed, not ported.
  3. Port the UI by hand, commit by commit, reading each commit's diff (`git show <sha> -- src`). Each
     React file has a Vue counterpart named in its "Ported from" header comment (`grep -rn "Ported from
     legacy/src/components/messages/foo" app`). New strings come with upstream's `en.json` and locale
     changes, which `apply` carries. React-only changes (render memoisation, effect rules, lint) need
     nothing. Behaviour changes do.
  4. `bun run typecheck`, `bun run lint`, `bun run test`, `bun run build`, then exercise what changed
     against `bun run preview`.
  5. `node scripts/upstream/port.mjs mark <sha>` records the new last-ported commit, in the same PR.
- **Things to know.**
  - Upstream's catalogues lag English by a few dozen keys at times. `t()` falls back to English, and
    `tests/unit/i18n.test.mjs` accepts missing keys but not unknown ones (upstream's own test fails on
    this).
  - Upstream's calendar tests used America/Vancouver, which current tzdata keeps on permanent daylight
    time from November 2026. The ported tests use America/Los_Angeles, which has the offsets the tests
    expect.
  - `tests/email-relay.test.mjs` tests upstream's `deploy/cloudflare-email-relay`, which is not ported.
  - D1 read replicas (upstream #268): `server/worker.ts` wraps Nitro's fetch in `runWithD1Session` and
    `getEnv()` swaps `DB` for the request's session; `DB_PRIMARY` keeps the raw binding for
    authentication reads. Email, queue and cron keep reading the primary.
  - This fork is on Drizzle 1.0 (`drizzle-orm` and `drizzle-kit` 1.0 RC); upstream is on 0.x. Its
    server code ports across unchanged with three exceptions that typecheck or the tests will show:
    `not()` returns `SQL | undefined` (add `!` where the result goes into an `SQL[]`, as `or()` already
    needs); `SQLiteSyncDialect` is now `SQLiteDialect` (`port-test.mjs` rewrites it); and the
    `drizzle-orm/sqlite-proxy` driver takes `{ all, get, run }` executors instead of one callback, so an
    upstream test that builds `drizzle(async (sql, params, method) => ...)` over `node:sqlite` should use
    `drizzle(sqliteExecutors(sqlite))` from `tests/unit/helpers/fixtures.mjs`. `drizzle(d1, { schema })`
    becomes `drizzle(d1)` (there are no relational queries). `getTableColumns` is deprecated in favour
    of `getColumns` but still works; leave upstream's spelling.
  - Upstream's migrations are flat 0.x files. `port.mjs` maps `drizzle/migrations/<name>.sql` to
    `server/db/migrations/sqlite/<name>/migration.sql` and ignores `drizzle/migrations/meta/`. Once
    the schema change is ported too, run `bun run db:snapshot` (records the schema as that folder's
    snapshot, so `db:generate` does not emit the change again), then `bun run db:check`. An upstream
    test that reads `drizzle/migrations/*.sql` or the journal needs the folder layout
    (`listMigrations` in `tests/unit/helpers/migrate.mjs`).

## Open items

- Fixed while porting sign-in: every passkey route returned 500 on Workers because tsyringe (via
  `@simplewebauthn/server` and `@peculiar/x509`) needs `reflect-metadata` at import time. It is now
  imported first in `server/worker.ts` and listed in `nitro.moduleSideEffects` so it is not
  tree-shaken. If another library fails at import time on Workers, look for the same kind of cause.
- Message authentication details (`/api/messages/{id}/authentication`) only trust an SES trace, as
  upstream's do, so mail received through Cloudflare always reports `untrusted`. Reading Cloudflare's
  own `Authentication-Results` there (as the spam analyser already does) would make the panel useful.

- Production has no admin yet. First-run registration is left for Matt (see workstream 12).
- `TURNSTILE_SECRET_KEY`, VAPID keys and APNs keys are not set on the Worker. Features that need them
  degrade as upstream's do: sign-in works without Turnstile, and push is off without VAPID keys. The
  Cloudflare connector these threads use cannot see the Flytower account, so neither the Turnstile
  widget nor the secrets could be created from here. To turn them on: create a Turnstile widget for
  mail.flytower.dev, set its secret as `TURNSTILE_SECRET_KEY` and its site key where the sign-in pages read it (workstream 2; upstream used `NEXT_PUBLIC_TURNSTILE_SITE_KEY`);
  generate VAPID keys with `bun run vapid:generate` and set them as Worker secrets.
- `public/locales/*.json` gained `notification.open` (added to English by workstream 1), copied from
  each catalogue's existing `drive.open` translation of the same word.
- The mailbox page's shared access card shows a disabled picker and a "Create an account" link (to
  `/accounts?new=1`, which opens the create dialog) when no account can be added. Upstream shows an
  empty dropdown. Its four `mailbox.*` strings are English only; other catalogues fall back.
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
