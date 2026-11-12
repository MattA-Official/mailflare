// Seeds the local D1 (Miniflare state in .wrangler/state) with an admin, a domain and a mailbox so
// you can sign in during `bun run dev` or `bun run preview` without the Cloudflare API.
//   bun run seed:local
// Sign in as admin@example.test / mailflare-dev. Never run against production: it is --local only.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import bcrypt from 'bcryptjs'

const root = new URL('../', import.meta.url).pathname
const dir = mkdtempSync(join(tmpdir(), 'mailflare-seed-'))
const config = join(dir, 'wrangler.json')
writeFileSync(config, JSON.stringify({
  name: 'flytower-mail',
  compatibility_date: '2026-11-01',
  d1_databases: [{ binding: 'DB', database_name: 'mailflare', database_id: '2c5e6a86-7940-44cc-9f11-2dc855d60cd9' }],
}))

function run(file) {
  execFileSync('bunx', ['wrangler', 'd1', 'execute', 'DB', '--local', '--persist-to', join(root, '.wrangler/state'), '-c', config, '--file', file], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] })
}

// 1. Schema: every migration in order, recorded in the same ledger the in-app runner uses.
const migrations = join(root, 'server/db/migrations/sqlite')
const ledger = join(dir, 'ledger.sql')
writeFileSync(ledger, 'CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL);')
run(ledger)
const applied = JSON.parse(execFileSync('bunx', ['wrangler', 'd1', 'execute', 'DB', '--local', '--persist-to', join(root, '.wrangler/state'), '-c', config, '--json', '--command', 'select name from d1_migrations'], { cwd: root }).toString())[0].results.map(row => row.name)
for (const name of readdirSync(migrations).filter(file => file.endsWith('.sql')).sort()) {
  if (applied.includes(name)) continue
  const file = join(dir, name)
  writeFileSync(file, `${readFileSync(join(migrations, name), 'utf8')}\n;INSERT INTO d1_migrations (name) VALUES ('${name}');`)
  run(file)
}

// 2. Data.
const hash = bcrypt.hashSync('mailflare-dev', 10)
const seed = join(dir, 'seed.sql')
writeFileSync(seed, `
INSERT OR IGNORE INTO users (id, email, password_hash, name, role, is_primary_admin, can_manage_mailboxes, can_manage_domains, can_manage_users, created_at)
  VALUES ('usr_dev', 'admin@example.test', '${hash}', 'Dev Admin', 'admin', 1, 1, 1, 1, unixepoch());
INSERT OR IGNORE INTO domains (id, user_id, hostname, zone_id, status, routing_status, routing_enabled, sending_enabled, sending_provider, created_at)
  VALUES ('dom_dev', 'usr_dev', 'example.test', 'manual', 'active', 'ready', 1, 0, 'none', unixepoch());
INSERT OR IGNORE INTO mailboxes (id, user_id, domain_id, local_part, display_name, created_at)
  VALUES ('mbx_dev', 'usr_dev', 'dom_dev', 'admin', 'Dev Admin', unixepoch());
`)
run(seed)
console.log('Seeded. Sign in as admin@example.test / mailflare-dev')
console.log('Deliver a test email in `bun run preview` with:')
console.log(`  curl -X POST 'http://localhost:8787/cdn-cgi/handler/email?from=alice@example.org&to=admin@example.test' -H 'content-type: message/rfc822' --data-binary $'From: Alice <alice@example.org>\\r\\nTo: admin@example.test\\r\\nSubject: Hello\\r\\nMessage-ID: <1@example.org>\\r\\n\\r\\nHi there\\r\\n'`)
