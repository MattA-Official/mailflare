// Records the current schema as the Drizzle Kit snapshot of a migration that Drizzle Kit did not
// write: one ported from upstream (still on Drizzle Kit 0.x) or a rare hand-written one. Without it
// the next `bun run db:generate` would emit that migration's changes a second time.
//   bun run db:snapshot                 # the newest migration folder
//   bun run db:snapshot 0096_some_name  # a given folder
// Run it after the schema matches what the migration does; `bun run db:check` then confirms.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = new URL('../', import.meta.url).pathname
const migrations = join(root, 'server/db/migrations/sqlite')
const folders = readdirSync(migrations).filter(name => existsSync(join(migrations, name, 'migration.sql'))).sort()
const target = process.argv[2] ?? folders.at(-1)
if (!folders.includes(target)) throw new Error(`No migration folder ${target}`)

// The snapshot this one follows: the newest one in an earlier folder.
const previous = folders.filter(name => name < target && existsSync(join(migrations, name, 'snapshot.json'))).at(-1)
const prevIds = previous ? [JSON.parse(readFileSync(join(migrations, previous, 'snapshot.json'), 'utf8')).id] : ['00000000-0000-0000-0000-000000000000']

// Drizzle Kit's own snapshot of the schema, generated against an empty folder.
const scratch = mkdtempSync(join(tmpdir(), 'mailflare-snapshot-'))
try {
  execFileSync('bunx', ['drizzle-kit', 'generate', '--dialect', 'sqlite', '--schema', 'server/db/schema/index.ts', '--out', scratch, '--name', 'snapshot'], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] })
  const [generated] = readdirSync(scratch)
  const snapshot = JSON.parse(readFileSync(join(scratch, generated, 'snapshot.json'), 'utf8'))
  snapshot.prevIds = prevIds
  writeFileSync(join(migrations, target, 'snapshot.json'), `${JSON.stringify(snapshot, null, 2)}\n`)
  console.log(`Wrote server/db/migrations/sqlite/${target}/snapshot.json`)
}
finally {
  rmSync(scratch, { recursive: true, force: true })
}
