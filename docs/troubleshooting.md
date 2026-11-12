# Troubleshooting

## Cloudflare error 9109: Invalid access token

Workers Builds deploys the Worker with its own build token, which is not available to Mailflare at runtime. Mailflare needs a separate Cloudflare API token in the `CF_TOKEN` secret.

Verify the token:

```bash
curl "https://api.cloudflare.com/client/v4/user/tokens/verify" \
  -H "Authorization: Bearer <CF_TOKEN>"
```

The response should report `success: true` and an active status. Check that:

- `CF_TOKEN` contains the token secret, not its ID.
- The value does not include the word `Bearer`.
- The token is currently valid and its IP restrictions allow the Worker.
- You redeployed after changing Cloudflare variables or secrets.

If you use a legacy Global API Key, set `CF_EMAIL` and `CF_API_KEY` instead of placing it in `CF_TOKEN`.

## Cloudflare error 10000 on Email Routing

Update the token so it can read the zone and manage its DNS, Email Routing settings, and Email Routing rules. The permissions are listed in the [deployment guide](deployment.md#cf_token).

## Cloudflare error 2008 for existing MX records

Cloudflare Email Routing cannot be enabled while another mail provider's MX records are present. Mailflare shows a confirmation before replacing them. Continuing deletes the existing MX records and points incoming mail to Cloudflare Email Routing, so the previous provider will stop receiving mail. The `CF_TOKEN` needs **DNS Edit** permission for this action.

## "This domain has MX records for another mail service"

Only one service can own a domain's MX records. Setting up receiving shows the records it would replace and waits for your confirmation; confirming means the previous service stops receiving mail for that domain.

## Scheduled backups are not running

The cron triggers are declared in `nuxt.config.ts` and applied by each deploy. Check under the Worker's **Settings → Triggers** in Cloudflare that both schedules are listed.

Also confirm that automatic backups are enabled under **Admin → Backups** and that the Worker has its `DB` and `BUCKET` bindings.

## Inbound mail is not arriving

Confirm that:

- The deployed Worker name, `CF_EMAIL_WORKER_NAME` and the `WORKER_SELF_REFERENCE` service in `nuxt.config.ts` all agree (`flytower-mail`).
- The zone's Email Routing catch-all and mailbox rules point at that Worker (an error 2016, "Workers Script Info not found", means they name a Worker that does not exist).
- Email Routing is enabled for the domain in Cloudflare.
- The mailbox has an Email Routing rule pointing to the Worker.
