/**
 * Issue a one-time passkey recovery link for the primary administrator, the operator fallback for a
 * sole administrator who has lost every passkey (other accounts get a link from an admin's account
 * page instead). Ported from upstream's scripts/passkey-recovery-link.ts, D1 only.
 *
 *   bun run auth:recovery-link -- admin@example.com [https://mail.flytower.dev]
 *
 * It prints two statements to run against the production D1 database with Wrangler, in order, and
 * the link to send through a trusted channel. The link expires after 30 minutes, works once and can
 * only enrol a new passkey; it cannot read mail.
 */
import { createHash } from 'node:crypto'
import { nanoid } from 'nanoid'

const [email, explicitOrigin] = process.argv.slice(2)
if (!email) {
  console.error('Usage: bun run auth:recovery-link -- <primary-admin-email> [https://public-origin]')
  process.exit(1)
}
const origin = (explicitOrigin ?? process.env.APP_URL ?? 'https://mail.flytower.dev').replace(/\/$/, '')
if (!origin.startsWith('https://') && !origin.startsWith('http://localhost')) {
  console.error('Pass the public HTTPS origin as the second argument.')
  process.exit(1)
}

// Same token format and hash as the app: newId('peg') and hashSessionToken (SHA-256, hex).
const token = `peg_${nanoid()}`
const tokenHash = createHash('sha256').update(token).digest('hex')
const emailSql = email.trim().toLowerCase().replace(/'/g, "''")
const target = `(SELECT id FROM users WHERE email = '${emailSql}' AND is_primary_admin = 1)`
const revoke = `UPDATE passkey_enrollment_grants SET used_at = strftime('%s','now') WHERE used_at IS NULL AND user_id IN ${target};`
const insert = `INSERT INTO passkey_enrollment_grants (id, user_id, token_hash, kind, created_by_user_id, expires_at, used_at, created_at) SELECT '${nanoid()}', id, '${tokenHash}', 'admin', NULL, strftime('%s','now') + 1800, NULL, strftime('%s','now') FROM users WHERE email = '${emailSql}' AND is_primary_admin = 1;`

console.log('Run these two statements against the production database, in order, then send the link below.')
console.log(`bunx wrangler d1 execute mailflare --remote --command "${revoke}"`)
console.log(`bunx wrangler d1 execute mailflare --remote --command "${insert}"`)
console.log('The insert affects 0 rows if the address is not the primary administrator.')
console.log(`Recovery link (valid 30 minutes, single use): ${origin}/setup/passkey?token=${encodeURIComponent(token)}`)
