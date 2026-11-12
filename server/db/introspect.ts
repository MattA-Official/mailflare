/** Schema introspection for raw `env.DB` callers (backups, setup checks). D1 is SQLite. */

/** Names of the tables in the database. */
export async function listTableNames(db: D1Database): Promise<Set<string>> {
	const result = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all<{ name: string }>();
	return new Set(result.results.map((row) => row.name));
}

/** Column names of a table, or an empty set when it does not exist. */
export async function listColumnNames(db: D1Database, table: string): Promise<Set<string>> {
	const result = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
	return new Set(result.results.map((column) => column.name));
}

export function quoteIdentifier(name: string): string {
	return `"${name.replaceAll('"', '""')}"`;
}
