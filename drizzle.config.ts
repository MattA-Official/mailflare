import { defineConfig } from 'drizzle-kit'

// Drizzle Kit writes this fork's migrations: `bun run db:generate` after changing the schema, then
// `bun run db:bundle`. The in-app runner applies them (see docs/PORTING.md, "Migrations").
export default defineConfig({
  dialect: 'sqlite',
  schema: './server/db/schema/index.ts',
  out: './server/db/migrations/sqlite',
})
