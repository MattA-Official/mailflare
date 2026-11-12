<img src="public/icon-192.png" alt="Mailflare" width="96" />

# Mailflare (Nuxt, Cloudflare-only fork)

Custom-domain email, calendar, booking pages, a drive and an email assistant, running entirely on
Cloudflare as a single Worker. This is a personal fork of
[hieunc229/mailflare](https://github.com/hieunc229/mailflare), with the app rewritten from Next.js to
[Nuxt](https://nuxt.com) and [Nuxt UI](https://ui.nuxt.com), and everything that is not Cloudflare
removed. It runs at https://mail.flytower.dev.

## Features

- **Email**: mailboxes on your own domains, personal or shared, aliases, conversation view, search,
  snooze, scheduled send with undo, follow-up reminders, opt-in read receipts, signatures, templates
  and auto-replies.
- **Routing rules**: store, forward, reject or sort incoming mail, per domain and per mailbox.
- **Spam filter**: authentication results, sender reputation, a Bayesian classifier per mailbox,
  URL and attachment checks, optional Spamhaus DQS and URLhaus lookups.
- **Calendar**: repeating events with time zones, invitations by email, reminders by push.
- **Booking**: public booking links on your calendar's free time.
- **Drive**: store files and share them by link.
- **Email assistant**: search mail, draft replies and manage events with Workers AI or an
  OpenAI-compatible provider; connect other AI tools over MCP. A person always confirms a send.
- **Clients and APIs**: JMAP for mail apps, a REST API with scoped keys, webhooks, and the mobile
  app sign-in with native push.
- **Admin**: accounts, domains, mailboxes, API keys, activity log, JSON backups to R2, branding.
- **Import**: IMAP, Gmail Takeout, `.eml` and `.mbox`, as background jobs.
- **Security**: passkeys, authenticator apps with recovery codes, step-up confirmation for sensitive
  changes, Turnstile.
- 34 interface languages, including right-to-left.

## What differs from upstream

- The UI is Vue on Nuxt UI, rendered in the browser. The server is upstream's, carried across
  nearly unchanged and mounted under Nitro, so it stays easy to compare with upstream.
- Cloudflare only: D1 (no PostgreSQL, MySQL or libSQL), R2 (no Backblaze B2 or S3), Cloudflare
  Email Routing and Email Sending (no Resend or Amazon SES), no Docker or Node runtime.
- No licence gate: every feature upstream sold under its Pro and Team licences is on (the AGPL
  permits this).
- No self-update button: deploys come from this repository through Workers Builds.

The full list is under "Deviations from upstream" in [docs/PORTING.md](docs/PORTING.md).

## Deploying

Workers Builds deploys the `nuxt` branch to the `flytower-mail` Worker on every push. Secrets,
first-run setup and local development are in [docs/deployment.md](docs/deployment.md).

```bash
bun install
bun run seed:local                  # local admin@example.test / mailflare-dev
bun run build && bun run preview    # the Worker in workerd on http://localhost:8787
bun run typecheck && bun run lint && bun run test && bun run test:e2e
```

Use bun; the lockfile is `bun.lock`.

## Documentation

- [Deployment and configuration](docs/deployment.md)
- [API and integrations](docs/api.md)
- [Email assistant and MCP](docs/email-assistant-and-mcp.md)
- [Spam protection](docs/spam-protection.md)
- [Security notes](docs/security.md)
- [Interface languages](docs/localization.md)
- [Troubleshooting](docs/troubleshooting.md)
- [How the port was done](docs/PORTING.md), and [CLAUDE.md](CLAUDE.md) for working on the code

## Licence

AGPL-3.0, as upstream. See [LICENSE](LICENSE).
