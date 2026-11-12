/**
 * Upstream supports SQLite, PostgreSQL and MySQL. This fork runs on D1 only, so the dialect is fixed.
 * The wider type is kept so ported comparisons (`dialect === "mysql"`) still compile; they are dead code.
 */
export type DatabaseDialect = "sqlite" | "postgres" | "mysql";

export function schemaDialect(): DatabaseDialect {
	return "sqlite";
}
