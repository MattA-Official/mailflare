import bundle from "./bundle.json";
import type { BundledMigration, MigrationNameRow, MigrationResult, MigrationStatus } from "./types";

// Generated from server/db/migrations/sqlite by scripts/generate-migration-bundle.mjs.
const MIGRATIONS = bundle.migrations as BundledMigration[];

/** D1 keeps the table name Wrangler uses, so `wrangler d1 migrations apply` and the in-app runner agree. */
const TABLE = "d1_migrations";
const CREATE = "CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)";
const EXISTS = "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'd1_migrations'";

export function migrationDialect(_db: D1Database): "sqlite" {
	return "sqlite";
}

async function getAppliedMigrationNames(db: D1Database): Promise<string[]> {
	const found = await db.prepare(EXISTS).first<MigrationNameRow>();
	if (!found) return [];
	const result = await db.prepare(`SELECT name FROM ${TABLE}`).all<MigrationNameRow>();
	return result.results.map((row) => row.name);
}

export async function getMigrationStatus(db: D1Database): Promise<MigrationStatus> {
	const applied = new Set(await getAppliedMigrationNames(db));
	const committed = new Set(MIGRATIONS.map((migration) => migration.name));
	const pending = MIGRATIONS.filter((migration) => !applied.has(migration.name)).map((migration) => migration.name);
	const unknown = [...applied].filter((name) => !committed.has(name)).sort();

	return { ready: pending.length === 0 && unknown.length === 0, pending, unknown };
}

export async function applyPendingMigrations(db: D1Database): Promise<MigrationResult> {
	const initial = await getMigrationStatus(db);
	if (initial.unknown.length > 0) {
		throw new Error("The database contains migrations that are not part of this Mailflare release.");
	}

	await db.prepare(CREATE).run();
	const applied: string[] = [];

	for (const name of initial.pending) {
		const migration = MIGRATIONS.find((candidate) => candidate.name === name);
		if (!migration) continue;

		try {
			await db.batch([
				db.prepare(`INSERT INTO ${TABLE} (name) VALUES (?)`).bind(name),
				...migration.statements.map((statement) => db.prepare(statement)),
			]);
			applied.push(name);
		} catch (error) {
			const completed = await db.prepare(`SELECT name FROM ${TABLE} WHERE name = ?`).bind(name).first<MigrationNameRow>();
			if (completed) continue;
			throw new Error(`Migration ${name} failed: ${error instanceof Error ? error.message : "Database error"}`);
		}
	}

	return { ...(await getMigrationStatus(db)), applied };
}
