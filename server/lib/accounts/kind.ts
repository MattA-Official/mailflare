// Fork-only. Accounts are people, or hidden accounts that hold something shared (users.kind, migration 0093):
// "inbox" holds a shared inbox (see #lib/mailboxes/principals). Anything other than "person" never signs in
// and is left out wherever people are listed or picked.
import { eq } from "drizzle-orm";
import { users } from "#db/schema";

/** True for an account a person signs in to. Every other kind is a hidden holder. */
export function isPersonAccount(account: { kind?: string | null } | null | undefined): boolean {
	return !!account && (account.kind ?? "person") === "person";
}

/** Query condition matching only people's accounts. */
export function isPersonCondition() {
	return eq(users.kind, "person");
}
