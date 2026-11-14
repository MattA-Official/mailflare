import { DatabaseSync } from "node:sqlite";

/**
 * The slice of better-sqlite3's API that upstream's tests use, over node:sqlite, so those tests run
 * without a native module. Aliased as `better-sqlite3` in vitest.config.ts.
 */
class Statement {
	constructor(statement) {
		this.statement = statement;
		this.mode = "object";
	}

	raw(enabled = true) {
		this.mode = enabled ? "raw" : "object";
		return this;
	}

	pluck(enabled = true) {
		this.mode = enabled ? "pluck" : "object";
		return this;
	}

	shape(rows) {
		// node:sqlite rows have a null prototype; better-sqlite3's are plain objects.
		if (this.mode === "object") return rows.map((row) => ({ ...row }));
		const arrays = rows.map((row) => Object.values(row));
		return this.mode === "pluck" ? arrays.map((row) => row[0]) : arrays;
	}

	get(...params) {
		const row = this.statement.get(...params);
		return row === undefined ? undefined : this.shape([row])[0];
	}

	all(...params) {
		return this.shape(this.statement.all(...params));
	}

	run(...params) {
		return this.statement.run(...params);
	}

	columns() {
		return this.statement.columns();
	}
}

export default class Database {
	constructor(filename = ":memory:") {
		// D1 keeps SQLite's double-quoted string fallback on: a quoted name that matches no column is read as a
		// string literal instead of failing. node:sqlite turns it off, so switch it back on to behave like D1.
		this.native = new DatabaseSync(filename, { enableDoubleQuotedStringLiterals: true });
	}

	prepare(sql) {
		return new Statement(this.native.prepare(sql));
	}

	exec(sql) {
		this.native.exec(sql);
		return this;
	}

	pragma(source, options = {}) {
		const rows = this.native.prepare(`PRAGMA ${source}`).all().map((row) => ({ ...row }));
		return options.simple ? (rows[0] ? Object.values(rows[0])[0] : undefined) : rows;
	}

	transaction(fn) {
		return (...args) => {
			this.native.exec("BEGIN");
			try {
				const result = fn(...args);
				this.native.exec("COMMIT");
				return result;
			} catch (error) {
				this.native.exec("ROLLBACK");
				throw error;
			}
		};
	}

	close() {
		this.native.close();
	}
}
