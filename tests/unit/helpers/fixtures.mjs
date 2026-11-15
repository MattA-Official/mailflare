import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { build } from "esbuild";
import { aliasPlugin, root } from "./paths.mjs";

export { root };

// Bundle one app module with literal module mocks and import it. Call dispose()
// once the test file's last import is done so the temporary directory is removed.
export async function loadFixture({ name, entryPoint, mocks }) {
	mkdirSync(join(root, "node_modules", ".cache"), { recursive: true });
	const temporary = mkdtempSync(join(root, "node_modules", ".cache", `${name}-test-`));
	await build({
		entryPoints: [join(root, entryPoint)],
		outfile: join(temporary, "fixture.mjs"),
		bundle: true,
		platform: "node",
		format: "esm",
		packages: "external",
		logLevel: "silent",
		plugins: [{ name: `${name}-fixtures`, setup(builder) {
			builder.onResolve({ filter: /.*/ }, ({ path }) => path in mocks ? { path, namespace: "mock" } : undefined);
			builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => ({ contents: mocks[path], loader: "js", resolveDir: root }));
		} }, aliasPlugin],
	});
	return {
		import: () => import(pathToFileURL(join(temporary, "fixture.mjs")).href),
		dispose: () => rmSync(temporary, { recursive: true, force: true }),
	};
}

// drizzle's sqlite-proxy executors over a node:sqlite database. The hooks let a
// test inject a competing write immediately before or after a query.
export function sqliteExecutors(sqlite, { beforeQuery, afterQuery } = {}) {
	const query = (sql, params, rowMode, read) => {
		beforeQuery?.(sql, sqlite);
		const statement = sqlite.prepare(sql);
		statement.setReturnArrays(rowMode !== "object");
		const result = read(statement, params);
		afterQuery?.(sql, sqlite);
		return result;
	};
	return {
		all: async (sql, params, rowMode) => query(sql, params, rowMode, (statement) => statement.all(...params)),
		get: async (sql, params, rowMode) => query(sql, params, rowMode, (statement) => statement.get(...params)),
		// Shaped like a D1 run result, which is what the app's code reads.
		run: async (sql, params) => query(sql, params, "array", (statement) => {
			const { changes, lastInsertRowid } = statement.run(...params);
			return { success: true, results: [], meta: { changes: Number(changes), last_row_id: Number(lastInsertRowid) } };
		}),
	};
}

// An in-memory SQLite database behind drizzle's sqlite-proxy driver.
export function sqliteProxy({ schema = "", beforeQuery, afterQuery } = {}) {
	const sqlite = new DatabaseSync(":memory:", { enableDoubleQuotedStringLiterals: true });
	sqlite.exec(schema);
	const db = drizzle(sqliteExecutors(sqlite, { beforeQuery, afterQuery }));
	return { db, sqlite };
}

// Same as sqliteProxy, but expose it as globalThis[store] so the bundled mocks
// can reach it, and return the database for direct assertions.
export function installSqlite(store, { extra = {}, ...options } = {}) {
	const { db, sqlite } = sqliteProxy(options);
	globalThis[store] = { db, sqlite, ...extra };
	return sqlite;
}

// Inject `concurrent` just before an app write to the users password snapshot.
export function concurrentPasswordWrite(concurrent) {
	let pending = concurrent;
	return (sql, sqlite) => {
		if (pending && /update\s+"?users"?/i.test(sql) && /password_hash/i.test(sql)) {
			sqlite.exec(pending);
			pending = "";
		}
	};
}
