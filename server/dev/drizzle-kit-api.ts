// NuxtHub's dev-only Drizzle Studio handler (POST /api/_hub/db/launch-studio) imports
// `drizzle-kit/api`, which Drizzle Kit 1.0 split into per-dialect entries. Without this stand-in
// the import fails and takes the whole `nuxt dev` server down. nuxt.config.ts aliases
// `drizzle-kit/api` here (the handler only exists in dev). D1 is the only database, so only the SQLite studio is wired up.
import { startStudioServer } from "drizzle-kit/api-sqlite";

export const startStudioSQLiteServer = startStudioServer;

export function startStudioPostgresServer(): never {
	throw new Error("Drizzle Studio for PostgreSQL is not available: this app is D1 only.");
}
