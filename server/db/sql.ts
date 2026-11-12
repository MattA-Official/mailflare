import { like, sql, type AnyColumn, type SQL } from "drizzle-orm";

/**
 * Small SQL helpers. Upstream keeps the SQL that differs between SQLite, PostgreSQL and MySQL here; this
 * fork runs on D1 only, so each is the SQLite form and the helpers stay so ported callers are unchanged.
 */

/** `LIKE`, which ignores ASCII case on SQLite. */
export function insensitiveLike(column: AnyColumn | SQL, pattern: string): SQL {
	return like(column as AnyColumn, pattern);
}

/** The value an `ON CONFLICT DO UPDATE` would have inserted. */
export function excluded(column: AnyColumn): SQL {
	return sql`excluded.${sql.identifier(column.name)}`;
}

/** Scalar maximum of several values (SQLite's multi-argument `max`). */
export function greatest(...values: Array<SQL | number>): SQL {
	const list = sql.join(values.map((value) => (typeof value === "number" ? sql.raw(String(value)) : value)), sql`, `);
	return sql`max(${list})`;
}

/** 1-based position of `needle` in `haystack`, 0 when absent. */
export function charIndex(haystack: AnyColumn | SQL, needle: string): SQL {
	return sql`instr(${haystack}, ${needle})`;
}

/** String concatenation. String arguments are SQL literals, so pass constants only. */
export function concatText(...parts: Array<SQL | string>): SQL {
	const list = parts.map((part) => (typeof part === "string" ? sql.raw(`'${part.replace(/'/g, "''")}'`) : part));
	return sql.join(list, sql` || `);
}

/** Boolean literals for `WHERE`. */
export const matchNothing: SQL = sql`1 = 0`;
export const matchEverything: SQL = sql`1 = 1`;

/** `ESCAPE` character for `LIKE`. */
export const LIKE_ESCAPE = "!";
export const escapeLike = (value: string) => value.replace(/[!%_]/g, "!$&");
