import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { root } from "./paths.mjs";

export const migrationsDir = join(root, "server/db/migrations/sqlite");

/**
 * Apply the repository's D1 migrations in journal order, recording them in `d1_migrations` as the
 * in-app runner does, so a test database has exactly the production schema.
 */
export async function applyMigrations(database, dir = migrationsDir) {
	const db = database.db;
	db.exec("CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)");
	const applied = new Set(db.prepare("SELECT name FROM d1_migrations").all().map((row) => row.name));
	let order;
	try {
		const journal = JSON.parse(await readFile(join(dir, "meta", "_journal.json"), "utf8"));
		order = journal.entries.map((entry) => `${entry.tag}.sql`);
	} catch {
		order = [];
	}
	const files = (await readdir(dir)).filter((name) => name.endsWith(".sql")).sort();
	// Anything the journal does not list (hand-written migrations) runs after it, in name order.
	const names = [...order.filter((name) => files.includes(name)), ...files.filter((name) => !order.includes(name))];
	const ran = [];
	for (const name of names) {
		if (applied.has(name)) continue;
		const sql = await readFile(join(dir, name), "utf8");
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
