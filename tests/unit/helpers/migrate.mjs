import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { root } from "./paths.mjs";

export const migrationsDir = join(root, "server/db/migrations/sqlite");

/**
 * Each migration is a Drizzle Kit folder holding migration.sql, recorded under "<folder>.sql" (the
 * name production's ledger has used since migrations were flat files). Sorted by name, which is the
 * order they were written in.
 */
export async function listMigrations(dir = migrationsDir) {
	return (await readdir(dir)).filter((name) => existsSync(join(dir, name, "migration.sql"))).sort().map((name) => `${name}.sql`);
}

/**
 * Apply the repository's D1 migrations in order, recording them in `d1_migrations` as the
 * in-app runner does, so a test database has exactly the production schema.
 */
export async function applyMigrations(database, dir = migrationsDir) {
	const db = database.db;
	db.exec("CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)");
	const applied = new Set(db.prepare("SELECT name FROM d1_migrations").all().map((row) => row.name));
	const names = await listMigrations(dir);
	const ran = [];
	for (const name of names) {
		if (applied.has(name)) continue;
		const sql = await readFile(join(dir, name.slice(0, -".sql".length), "migration.sql"), "utf8");
		const statements = sql.split(/-->\s*statement-breakpoint/g).map((statement) => statement.trim()).filter(Boolean);
		db.exec("BEGIN");
		try {
			for (const statement of statements) {
				const clean = statement.replace(/^\s*--.*$/gm, "").trim();
				if (clean) db.exec(clean);
			}
			db.prepare("INSERT INTO d1_migrations (name) VALUES (?)").run(name);
			db.exec("COMMIT");
		} catch (error) {
			db.exec("ROLLBACK");
			throw new Error(`Migration ${name} failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
		}
		ran.push(name);
	}
	return ran;
}
