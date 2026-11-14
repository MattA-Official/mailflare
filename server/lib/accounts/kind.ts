// Fork-only. Accounts are people, or hidden accounts that hold something shared (users.kind, migration 0093):
// "inbox" holds a shared inbox (see #lib/mailboxes/principals), "drive" a shared drive (#lib/drive/shared-drives). Anything other than "person" never signs in
// and is left out wherever people are listed or picked.
//
// The column is read through `accountKinds`, not `users`, and single-account checks treat a database without
// the column as all people, so signing in and the admin update card keep working until 0093 is applied.
import { eq, sql } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { AppDatabase } from "#db";

/**
 * users.kind, mapped apart from `users` on purpose: every `select().from(users)` on the sign-in path keeps
 * working on a database that has not had 0093 applied, so the primary admin can still reach the update card.
 * Kept out of #db/schema so nothing that walks the schema's tables sees "users" twice.
 */
export const accountKinds = sqliteTable("users", {
	id: text("id").primaryKey(),
	kind: text("kind", { enum: ["person", "inbox", "drive"] }).notNull().default("person"),
});

/** Query condition, for a query over `users`, matching only people's accounts. */
export function isPersonCondition() {
	return sql`"users"."kind" = 'person'`;
}

/** True when the account is a person's. A database not yet migrated to 0093 has only people. */
export async function isPersonAccountId(db: AppDatabase, id: string): Promise<boolean> {
	try {
		const [row] = await db.select({ kind: accountKinds.kind }).from(accountKinds).where(eq(accountKinds.id, id)).limit(1);
		return !row || row.kind === "person";
	} catch (error) {
		if (isMissingKindColumn(error)) return true;
		throw error;
	}
}

function isMissingKindColumn(error: unknown): boolean {
	for (let current: unknown = error; current; current = (current as { cause?: unknown }).cause) {
		if (current instanceof Error && /no such column: "?kind\b/i.test(current.message)) return true;
		if (!(current instanceof Error)) break;
	}
	return false;
}
