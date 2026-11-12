# Server architecture

How the server works, carried over from upstream's CLAUDE.md when `legacy/` was removed. The server was
ported from upstream nearly unchanged, so these notes still hold, with upstream's paths mapped
(`src/lib` is `server/lib`, `src/app/api` is `server/handlers/api`, `src/db` is `server/db`). Sections
about what this fork dropped (other databases, providers, storage, the Node runtime, licences and
self-update) are left out; [CLAUDE.md](../CLAUDE.md) says how the Nuxt side differs.

Where these notes mention Resend, Amazon SES, an SMTP listener or a Node scheduler, that path no
longer exists here: Cloudflare Email Routing and the Worker's own handlers are the only ones.

## Architecture

### server/worker.ts is the entrypoint

`server/worker.ts` (the Nitro entry) wraps Nitro's fetch handler and adds handlers Nitro's hooks cannot express:

- **`fetch`** — intercepts `/api/realtime` for the WebSocket upgrade (authenticates the session cookie, then routes to `env.REALTIME.getByName(user.id)`), delegating everything else to Nitro.
- **`email`** — the Cloudflare Email Routing handler. Resolves domain routing rules first (`resolveIncomingMail` in `server/lib/email/incoming.ts`) because `message.setReject()` and `message.forward()` only exist here, then applies optional account-level forwarding (loop-guarded by the `MAILFLARE_FORWARDED_HEADER`), writes raw MIME to R2, and enqueues to `INBOUND_QUEUE`. It never parses mail inline.
- **`queue`** — a single consumer for both queues; `isInboundQueueMessage` and `isWebhookRetryMessage` in `server/worker/utils.ts` discriminate inbound mail, webhook retries, and outbound payloads. Failures `retry({ delaySeconds: 10 })`.

It also re-exports `RealtimeHub`, which must remain exported from the Worker entrypoint.

### Mail pipeline

Inbound: `email` handler → R2 → queue → `processInboundMessage` (`server/lib/email/inbound.ts`) → `resolveInboundAddress` routing decision (deliver / reject / forward) → `parseRawMime` (postal-mime) → insert message + attachments → upsert contacts → `dispatchWebhooks` → `notifyUsersOfNewMessage` over the Durable Object.

Outbound: `server/lib/email/send.ts` / `sender.ts`, composing with mimetext and sending through the `EMAIL` send_email binding, with `outbound_jobs` rows tracking queued sends. `to`, `cc` and `bcc` accept a header string or an array; `toAddr`/`ccAddr`/`bccAddr` on `messages` store the full comma-joined lists (use `splitEmailAddressList` from `server/lib/email/address.ts`, not `getEmailAddress`, when a value may be a list).

Composer: `src/components/compose/rich-text-editor.tsx` is a contentEditable HTML editor; the body is one HTML string and the text/plain part is derived with `htmlToPlainText` (`rich-text-utils.ts`). Quoted/forwarded content is wrapped by `wrapQuotedHtml` and folded by both the composer and the reader (`splitQuotedHtml`). Forward copies the source's attachments onto the draft (`copyMessageAttachments`); `/api/send` with `draftId` sends them.

Threading: `resolveThreadId` in `server/lib/email/threading.ts` files an inbound or imported message under the thread of the stored message its `In-Reply-To`/`References` name (matched against `providerMessageId` in the same mailbox); otherwise its own Message-ID seeds a new thread. Outbound replies carry `inReplyTo`/`references`/`threadId` from the draft, and a fresh send is keyed by the Message-ID Cloudflare returns. `/api/messages/[id]/thread` returns the conversation. Lists pass `group=thread` (the "conversation view" toggle, `use-conversation-view.ts`) to get one row per thread plus `threadMessageIds`, which row actions and bulk actions expand to.

### Routing rules have two scopes

`routing_rules.scope` splits two genuinely different mechanisms, and mixing them up is the easy mistake:

- **`domain`** — evaluated by `resolveInboundAddress` (`server/lib/email/routing.ts`) *while resolving the address*, in three phases: `reject` rules first (so a sender can be blocked even when the recipient is a real mailbox), then exact mailbox and alias lookup, then `forward`/`store` catch-all fallbacks. Ordered by descending `priority`, then oldest first. This phase split is what stops a `*` catch-all from shadowing real mailboxes — preserve it.
- **`mailbox`** — evaluated by `resolveInboxRuleDestination` *after* delivery, to pick a folder or move to spam/trash.

Both queries filter on `scope`, so any new rule must set it explicitly. `forward` and `reject` are actioned in `server/worker.ts`, never in the queue consumer.

### Webhook retries ride the outbound queue

`server/lib/email/webhooks.ts` records every attempt (status, error snippet, duration, `nextRetryAt`) on `webhook_deliveries` and re-enqueues failures onto `OUTBOUND_QUEUE` with a `delaySeconds` backoff rather than adding a third queue binding. `env.d.ts` widens `OUTBOUND_QUEUE` to the union of both payload types accordingly. `runDelivery` is shared by the retry queue and the manual retry endpoint.

### Cloudflare is a live dependency, not just a host

Domain and mailbox management call the Cloudflare API at runtime (`server/lib/cloudflare-api.ts`, `server/lib/domains/`). Adding a domain enables Email Routing DNS and sending subdomains on the zone; creating a mailbox creates a Cloudflare Email Routing rule targeting `CF_EMAIL_WORKER_NAME`; removing a domain cleans those up (`server/lib/domains/cloudflare-cleanup.ts`).

Consequence: `CF_EMAIL_WORKER_NAME`, the deployed Worker `name`, and `services[].service` for `WORKER_SELF_REFERENCE` in `wrangler.jsonc` must all agree. Cloudflare service bindings need a literal name and cannot reference the top-level `name`.

Auth is `CF_TOKEN` (preferred) or the legacy `CF_EMAIL` + `CF_API_KEY` pair.

### JMAP lives in `server/lib/jmap/`

`handleJmapRequest` (`server/lib/jmap/handler.ts`) owns `/jmap/*` and `/.well-known/jmap`; the Next routes under `src/app/jmap/[[...segments]]` and `src/app/.well-known/jmap` only delegate to it, and it is framework-free so it could be mounted from `server/worker.ts` too. Auth is an API key with the `jmap` scope via `authenticateApiRequest` (`server/lib/api/key-auth.ts`, the Next-free core that `server/lib/api/auth.ts` now wraps). JMAP Mailbox ids encode `mailboxId`, `mailboxId~role` or `mailboxId~f~folderId` (`ids.ts`); `email-query.ts` maps filters onto `messages` columns, `email-objects.ts` builds Email objects from stored rows (no MIME parsing).

`processRequest` memoizes the accessible mailboxes and the change scope on `ctx.memo` across read-only calls of one request; write methods run with `memo: null` because they read `oldState` and `newState` in the same call.

States are positions in a change log (`changes.ts`): the `jmap_changes_*` triggers of migration 0064 (PostgreSQL and MySQL: `0001_triggers_and_seeds`) write a row per created, updated or destroyed message and per folder or mailbox change into `jmap_changes`, so `Email/changes`, `Mailbox/changes` and `Thread/changes` return real deltas (`Email/queryChanges` still answers `cannotCalculateChanges`). A state is `c1:<seq>:<access fingerprint>`; a sharing change alters the fingerprint, and the daily cron prunes rows older than 30 days and raises `jmap_change_floor`, and either makes older states answer `cannotCalculateChanges`. Like `jmap_mailbox_revisions`, these tables are derived and excluded from backups. Never write to them from application code.

### Mobile apps: device keys and native push

`POST /api/auth/device` signs a mobile app in with email + password (+ MFA via the login challenge) and returns a `jmap`-scoped API key of `kind = 'device'`, named after the device. It has its own rate limit (`DEVICE_LOGIN_RATE_LIMIT`) since it skips Turnstile. Device keys are listed and revoked under Settings → Security (`/api/devices`), hidden from the API keys list, and `deleteUserSessions` revokes them all (password change, reset, MFA change). Apps register their APNs token with `PUT /api/mobile/push` using the device key; `push_devices` rows cascade with the key. `notifyUsersOfNewMessage` fans out to `sendNativePush` (`server/lib/push/native.ts`), which needs the `APNS_KEY_ID`, `APNS_TEAM_ID` and `APNS_PRIVATE_KEY` secrets and encrypts sender and subject to each device's P-256 key (`native-crypto.ts`), or sends a content-free alert when the device turned previews off.

Native push goes straight to APNs when the server has `APNS_KEY_ID`/`APNS_TEAM_ID`/`APNS_PRIVATE_KEY`, or through a push relay (`mailflare-relay`, set `APNS_RELAY_URL`) when it has none. The app decides per registration: it trades its APNs token for a relay handle (`mfr1.…`, `server/lib/push/relay.ts`) and registers that as `token`; `sendNativePush` routes handles to the relay and hex tokens to Apple. `push_devices` is unique per (platform, token, user), and a device key keeps one registration (`registerPushDevice` deletes the one it replaces). The PUT response's `deliverable` says whether this server can send for that token, so the app can fall back from a handle to the raw token.

`Email/set` create and `Email/import` share one insert (`insertDraft` in `emails.ts`) and one target rule (`resolveDraftsMailbox` in `email-import-utils.ts`): a new message goes into exactly one Drafts mailbox, never Inbox or a folder, because delivered mail is the inbound pipeline's job. `Email/import` parses the uploaded blob with `parseRawMime`, stores the `Message-ID` in `providerMessageId` with its angle brackets (as inbound rows do) and keeps the uploaded bytes at `drafts/<messageId>.eml` in `rawR2Key`, so `readBlob` serves the client's own MIME back instead of the rebuilt minimal message; the `jmap-uploads/` object is deleted once claimed. `Email/copy` and `Email/parse` are still `emailUnsupported`.

`email-query.ts` answers the `header` filter from columns — `Message-ID` from `providerMessageId` (compared with and without angle brackets, since inbound rows store them and outbound rows do not), `In-Reply-To` from `inReplyTo`, `References` by a padded `LIKE` on the space-joined chain. Any other header name throws `unsupportedFilter` (RFC 8620 §5.5). Filter conditions must never be silently dropped: a client that de-duplicates with `header` would otherwise match every message in the mailbox.

### Password reset and MFA

`reset_email` on `users` is the destination for reset links (`server/lib/auth/password-reset.ts`); links are hashed, single-use, 30 minutes, and redeeming one revokes every session. Reset mail is sent by `sendSystemEmail` (`server/lib/email/system-mail.ts`), which writes straight to the send binding from the first admin mailbox on a sending-enabled domain, so nothing lands in Sent and no webhooks fire. If no domain can send, the request still returns 200 and a warning is logged. TOTP lives in `server/lib/auth/totp.ts` (RFC 6238 over Web Crypto, no dependency); the secret is stored on `users` at enrolment but only counts once `totp_enabled` is set by a verified code. A login with MFA returns `{ mfaRequired, challengeToken }` (`login_challenges`, 5 minutes) instead of a session, and `/api/auth/mfa/verify` finishes it with a TOTP or recovery code. Password changes and admin resets call `deleteUserSessions`.

### Read receipts are an opt-in pixel

The composer's eye toggle (`use-track-opens.ts`) starts from the account default in `user_compose_preferences` (Settings → Inbox → Compose, `/api/settings/compose`, migration 0072, off before it) and sends `trackOpens`; toggling it changes only that message. The same table holds `undo_send_seconds` (migration 0073, 0/5/10/15/30, default 15), which `sendEmail` reads for `undoSend` requests; 0 delivers at once. `deliverEmail` creates the `message_tracking` token at actual delivery, so a cancelled undo-send or reschedule leaves none, and injects the pixel only into the HTML handed to the provider: the stored Sent copy never contains it. The pixel is `GET /api/i/<token>.gif` (public, always the same GIF); `classifyOpen` (`server/lib/tracking/open-tracking-utils.ts`) names the client and device, drops device and location for proxies (Gmail, Yahoo, Apple), and flags Apple Mail Privacy Protection (Apple ASNs) and fetches within 10 s of delivery as `automated`, which `open_count` excludes. Pixel origin is the sender domain's own host from `domain_tracking_hosts` (set on the Domains page, must be the domain or a subdomain and attached to the Worker as a custom domain, kept out of `domains` so sending never depends on migration 0069), else `APP_URL`, else the composer request's origin; with neither, or before migration 0068, mail goes out untracked rather than failing. One pixel per message, so opens are not attributed to a recipient.

### Spam scoring adds up signals

`analyzeSpam` (`server/lib/spam/engine.ts`) sums scored signals from the analyzers in `server/lib/spam/analyzers/`, contact relationships, per-mailbox reputation and the Bayesian classifier, then applies `SPAM_THRESHOLDS` (`weights.ts`). Authentication is trusted only from the receiving side: verdicts SES computed (the SNS receipt for SES intake, the leading `X-SES-*`/`Authentication-Results: amazonses.com` block for Resend intake, read by `readSesTrace`) ride the queue message as `verdicts`, and otherwise only a Cloudflare-written `Authentication-Results` header counts. `ExternalSpamIntelligenceProvider` adds Spamhaus DQS (ZEN, DBL), abuse.ch URLhaus and RDAP domain age; each lookup is optional, time-limited, cached in memory and under `spam-cache/` in `env.BUCKET` (the Cache API does nothing on workers.dev), and a failure adds no signal. Spamhaus' public mirrors refuse queries from public resolvers such as our DoH endpoint, so only DQS keys work. Keys, the domain-age switch and installation-specific brands live in `app_settings` (admin Spam filter page, `server/lib/spam/settings.ts`), falling back to the `SPAMHAUS_DQS_KEY`, `ABUSECH_AUTH_KEY` and `SPAM_DOMAIN_AGE_CHECK` env vars; reading them tolerates a database without migration 0070. Keep regional brands out of the built-in list in `impersonation.ts`.

### Follow-up reminders surface unanswered sends

The composer's bell (`FollowUpMenu`) sends `followUpDays`; `deliverEmail` arms a `follow_ups` row once the message is actually out, so cancelled undo-sends leave none. The five-minute cron (`runFollowUpReminders` in `server/lib/follow-ups/service.ts`) moves due rows to `due`, or to `replied` when an inbound message joined the same thread in the same mailbox after the send; listing and reading re-check that, so a late reply closes a reminder too. Due reminders are not inbox rows: `DueFollowUps` pins them above the first inbox page, linking to the Sent message, with snooze and done. Reminders belong to the user who armed them. Before migration 0071 every reader returns nothing and arming is skipped.

Optional tables are detected with `isMissingTableError` (`server/lib/database-errors.ts`): drizzle rethrows driver errors as "Failed query" with the SQLite message on `cause`, so matching `String(error)` misses it.

### Calendar reminders are Web Push from the five-minute cron

`calendar_events.reminder_minutes` (null = none, 0-10080) is set in the event editor. `runCalendarReminders` (`server/lib/calendar/reminders.ts`, in `server/worker.ts` `scheduled()`) expands each event with `expandToolEvents` and pushes every occurrence whose start minus the offset has passed and that has not started. `last_reminded_start` is claimed with a conditional update before sending, so overlapping runs never notify twice; editing an event resets it. Delivery is `sendPushContent` (`server/lib/push/server.ts`), the generic form that `sendPushNotifications` now wraps; native APNs push is not wired to reminders. Before migration 0078 the cron does nothing (`isMissingColumnError`).

### Imports are background jobs

`/api/import/messages` (uploads) and `/api/import/imap` only validate and create a row in `import_jobs`, then answer 202 with the job; nothing is imported inside the request. `processImportJob` (`server/lib/import/jobs.ts`) handles one chunk per `import.run` message on `OUTBOUND_QUEUE` (like webhook retries, so no extra binding), records counters and the resume `cursor` on the row, and enqueues the next chunk itself. Uploaded files are split and staged in the bucket as `import-jobs/<id>/<n>.bin` batches (`staging.ts`), deleted as consumed. IMAP jobs read the folder list from `spec`, but the password never touches the database: it rides along in each queue message, so a lost message fails the job instead of resuming. Cancelling flips the status; every chunk's final write is conditional on the job still being active. `sweepImportJobs` (cron) fails jobs idle for 30 minutes and prunes finished records after 7 days. The import page polls `GET /api/import/jobs`; `DELETE /api/import/jobs/[id]` cancels an active job or dismisses a finished one. IMAP chunks pipeline their FETCHes (sizes first via `RFC822.SIZE`, then groups bounded by `planImapFetchGroups`). Chunk size is adaptive: `cursor.size` halves when a chunk throws (retried up to 4 times, except credential errors) or when the queue redelivers the message (`attempt` from `msg.attempts`, e.g. a resource-limit 503), and climbs back after clean chunks. A failed job can be resumed (`resumeImportJob`, `POST /api/import/jobs/[id]/resume`): it re-queues from the saved cursor, IMAP asks for the password again, and file jobs keep their staged batches until dismissed or pruned. An IMAP source the server cannot open (`isMissingImapFolderError`, e.g. Gmail's `[Gmail]` parent) is skipped with a recorded error instead of failing the job. `import_jobs` is in `INTERNAL_TABLES`, so backups skip it.

### Search is an FTS5 index kept by triggers

`messages_fts` (migration 0030) is an external-content FTS5 table over `messages` (SQLite only; other dialects use the `LIKE` fallback in `conditions.ts`); three triggers in the same migration keep it in sync on insert, update and delete, so no application code touches the index. `buildSearchConditions` in `server/lib/search/conditions.ts` turns the Gmail-style grammar (`server/lib/search/query-utils.ts`) into a `rowid IN (SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?)` predicate plus plain column filters. Two consequences: the bootstrap SQL in `server/lib/setup/migration.ts` is split with `splitSqlStatements`, which keeps trigger bodies whole; and the backup coverage check skips `messages_fts%`, since the shadow tables are derived and repopulate on restore. `wrangler d1 export` does not work on databases with virtual tables; the app's own JSON backup is unaffected.

### Access control

Two independent auth surfaces:

- **Session cookie** (`ep_session`) — `getCurrentUser` / `requireUser` in `server/lib/auth/cookies.ts`, backed by `server/lib/auth/session.ts`. Used by dashboard/admin API routes. `requireUser` *throws*, which Next surfaces as a 500; prefer `requireSessionUser` from `server/lib/api/auth.ts`, which returns a proper 401 response. Most older routes still use `requireUser` and 500 on unauthenticated requests.
- **API key bearer token** — `authenticateApiKey` + `requireScope` in `server/lib/api/auth.ts`, used by the public `/api/v1/*` surface.

Mailbox content authorization goes through `server/lib/mailboxes/access.ts` (`getMailboxAccessLevel`, `listAccessibleMailboxes`, `listAccessibleMailboxIds`), which accounts for ownership and the `mailbox_access` sharing table. Message queries scope by accessible mailbox IDs, not by `userId` — see `server/handlers/api/messages/route.ts` for the canonical pattern. Mailbox details, aliases and avatars use `getMailboxSettingsAccess` in `server/lib/mailboxes/settings-access.ts`: on an installation licensed for account management, the primary admin can configure other accounts' mailboxes, and admins with user-management permission can configure ordinary users' mailboxes. This does not grant access to their messages or sending identities. Primary mailbox names and avatars follow the mailbox owner's account identity.

### Folders are mostly virtual

`messages.status` is a free-text column driving the folder views: `received` (inbox), `sent`, `draft`, `spam`, `trash`, `archived`. Orthogonal to that are `starred`, `snoozedUntil`, and `folderId` (user-created folders in the `folders` table). A "folder" route under `src/app/(dashboard)/` is usually a status filter, not a table.
