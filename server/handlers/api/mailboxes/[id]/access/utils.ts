import { and, eq, isNull, ne } from "drizzle-orm";
import type { getDb } from "#db";
import { mailboxes, users } from "#db/schema";
import type { SessionUser } from "#lib/auth/types";
import { canManageSharedInbox } from "#lib/groups/permissions";

type Db = ReturnType<typeof getDb>;
type Actor = Pick<SessionUser, "id" | "role" | "isPrimaryAdmin" | "canManageUsers" | "canManageMailboxes">;

/**
 * A shared inbox the admin may manage access to. Upstream allowed only its owner; the fork lets the
 * primary admin and admins trusted with mailboxes or accounts do it too (see canManageSharedInbox).
 */
export async function getSharedMailboxForAdmin(db: Db, mailboxId: string, admin: Actor) {
	const [mailbox] = await db
		.select({ id: mailboxes.id, userId: mailboxes.userId, type: mailboxes.type })
		.from(mailboxes)
		.where(and(eq(mailboxes.id, mailboxId), eq(mailboxes.type, "shared")))
		.limit(1);
	return mailbox && canManageSharedInbox(admin, mailbox) ? mailbox : null;
}

/**
 * Accounts a shared inbox can be given to: every enabled account except the inbox's owner, who already
 * has it. Upstream offered only accounts the acting admin had created, which left the list empty for
 * accounts made at setup or by another admin.
 */
export function shareableAccountsCondition(ownerUserId: string) {
	return and(eq(users.disabled, false), isNull(users.deletedAt), ne(users.id, ownerUserId));
}
