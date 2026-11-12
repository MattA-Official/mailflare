import Database from "./better-sqlite3.mjs";

/**
 * The D1 database API over node:sqlite, for unit tests. Drizzle's D1 driver and the app's raw
 * `env.DB.prepare(...)` calls both go through it, so the schema, migrations, FTS index and triggers
 * behave as on D1. (Upstream ran its tests against the self-hosted runtime's better-sqlite3 wrapper.)
 */
function meta(info) {
	const changes = Number(info?.changes ?? 0);
	return { duration: 0, size_after: 0, rows_read: 0, rows_written: changes, last_row_id: Number(info?.lastInsertRowid ?? 0), changed_db: changes > 0, changes };
}

function normalizeParam(value) {
	if (value instanceof Date) return Math.floor(value.getTime() / 1000);
	if (typeof value === "boolean") return value ? 1 : 0;
	if (value instanceof ArrayBuffer) return new Uint8Array(value);
	if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
	if (value === undefined) return null;
	return value;
}

class SqlitePreparedStatement {
	constructor(database, sql, params = []) {
		this.database = database;
		this.sql = sql;
		this.params = params;
	}

	bind(...values) {
		return new SqlitePreparedStatement(this.database, this.sql, values.map(normalizeParam));
	}

	statement() {
		const cache = this.database.statements;
		let statement = cache.get(this.sql);
		if (!statement) {
			statement = this.database.db.native.prepare(this.sql);
			cache.set(this.sql, statement);
		}
		return statement;
	}

	isRead() {
		return /^\s*(select|with|pragma|explain)\b/i.test(this.sql) || /\breturning\b/i.test(this.sql);
	}

	async first(column) {
		const row = this.statement().get(...this.params);
		if (!row) return null;
		return column ? row[column] : { ...row };
	}

	async run() {
		if (this.isRead()) {
			const results = this.statement().all(...this.params).map((row) => ({ ...row }));
			return { results, success: true, meta: meta() };
		}
		const info = this.statement().run(...this.params);
		return { results: [], success: true, meta: meta(info) };
	}

	async all() {
		return this.run();
	}

	async raw(options) {
		const statement = this.statement();
		if (!this.isRead()) {
			statement.run(...this.params);
			return [];
		}
		statement.setReturnArrays(true);
		const rows = statement.all(...this.params);
		statement.setReturnArrays(false);
		if (options?.columnNames) return [statement.columns().map((column) => column.name), ...rows];
		return rows;
	}
}

export class SqliteDatabase {
	constructor(filename = ":memory:") {
		this.db = new Database(filename);
		this.statements = new Map();
		this.db.exec("PRAGMA foreign_keys = ON");
	}

	prepare(sql) {
		return new SqlitePreparedStatement(this, sql);
	}

	/** Run statements atomically, like D1's batch. */
	async batch(statements) {
		const results = [];
		this.db.exec("BEGIN");
		try {
			for (const statement of statements) results.push(await statement.all());
			this.db.exec("COMMIT");
		} catch (error) {
			this.db.exec("ROLLBACK");
			throw error;
		}
		return results;
	}

	async exec(sql) {
		this.db.exec(sql);
		return { count: 0, duration: 0 };
	}

	withSession() {
		return this;
	}
}

export function openSqliteDatabase(filename = ":memory:") {
	return new SqliteDatabase(filename);
}
