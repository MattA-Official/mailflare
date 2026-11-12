import { sql, type SQL } from "drizzle-orm";
import * as sqlite from "drizzle-orm/sqlite-core";

/**
 * The column and table constructors the schema is written against. Upstream swaps this kit per
 * dialect; this fork is D1 only, so only the SQLite kit remains. Keeping the kit means
 * schema/index.ts stays identical to upstream's and schema changes can be copied across.
 */
export const kit = {
	table: sqlite.sqliteTable,
	text: sqlite.text,
	integer: (name: string) => sqlite.integer(name),
	bool: (name: string) => sqlite.integer(name, { mode: "boolean" }),
	timestamp: (name: string) => sqlite.integer(name, { mode: "timestamp" }),
	autoId: (name: string) => sqlite.integer(name).primaryKey({ autoIncrement: true }),
	index: sqlite.index,
	uniqueIndex: sqlite.uniqueIndex,
	desc: (column: unknown): SQL | never => sql`${column} desc` as never,
	nowSeconds: sql`(unixepoch())` as SQL,
};

export type SchemaKit = typeof kit;
