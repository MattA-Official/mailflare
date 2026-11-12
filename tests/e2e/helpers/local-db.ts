// Runs SQL against the local D1 that `bun run preview` uses (Miniflare state in .wrangler/state), the
// same way `bun run seed:local` does. Upstream's e2e suite reset its demo account with
// `POST /api/seed?reset=1`; that route refuses production builds, and `bun run preview` serves one.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = new URL('../../../', import.meta.url).pathname
const dir = mkdtempSync(join(tmpdir(), 'mailflare-e2e-'))
const config = join(dir, 'wrangler.json')
writeFileSync(config, JSON.stringify({
  name: 'flytower-mail',
  compatibility_date: '2026-11-01',
  d1_databases: [{ binding: 'DB', database_name: 'mailflare', database_id: '2c5e6a86-7940-44cc-9f11-2dc855d60cd9' }],
}))

export function runLocalSql(sql: string) {
  if (process.env.E2E_BASE_URL) throw new Error('runLocalSql only works against the local preview database')
  const file = join(dir, `${Date.now()}-${Math.random().toString(36).slice(2)}.sql`)
  writeFileSync(file, sql)
  execFileSync('bunx', ['wrangler', 'd1', 'execute', 'DB', '--local', '--persist-to', join(root, '.wrangler/state'), '-c', config, '--file', file], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] })
}
