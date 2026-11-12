import { drizzle } from "drizzle-orm/d1";
import { schema } from "#db/schema";

export type AppDatabase = ReturnType<typeof createDb>;

export function createDb(d1: D1Database) {
	return drizzle(d1, { schema });
}

/** The drizzle instance for the D1 binding. */
export function getDb(env: Pick<CloudflareEnv, "DB">) {
	if (!env.DB) {
		throw new Error("No database binding configured");
	}
	return createDb(env.DB);
}

export { schema };
