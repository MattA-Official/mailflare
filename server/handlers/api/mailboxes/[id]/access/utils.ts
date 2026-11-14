import { and, eq, isNull, ne } from "drizzle-orm";
import type { getDb } from "#db";
import { mailboxes, users } from "#db/schema";
import type { SessionUser } from "#lib/auth/types";
import { canManageSharedInbox } from "#lib/groups/permissions";
import { NextResponse } from "#lib/http/next-compat";
import { getEnv } from "#lib/cloudflare";
import { requireUser } from "#lib/auth/cookies";
import { getMailboxAccessLevel } from "#lib/mailboxes/access";
import { isPersonCondition } from "#lib/accounts/kind";

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
 * Fork-only. A shared inbox whose access the user may manage: as an admin who manages shared inboxes, or
 * as anyone with full access to it, directly or through a group (standalone shared inboxes, phase 3).
 */
export async function getSharedMailboxForManager(db: Db, mailboxId: string, user: Actor) {
	const [mailbox] = await db
		.select({ id: mailboxes.id, userId: mailboxes.userId, type: mailboxes.type })
		.from(mailboxes)
		.where(and(eq(mailboxes.id, mailboxId), eq(mailboxes.type, "shared"), eq(mailboxes.disabled, false)))
		.limit(1);
	if (!mailbox) return null;
	if (canManageSharedInbox(user, mailbox)) return mailbox;
	return (await getMailboxAccessLevel(db, user, mailboxId))?.canManage ? mailbox : null;
}

/** Fork-only. Whether the user may manage who has a shared inbox; see getSharedMailboxForManager. */
export async function canManageSharedInboxAccess(db: Db, user: Actor, mailbox: { id: string; userId: string; type: string }): Promise<boolean> {
	if (mailbox.type !== "shared") return false;
	return !!(await getSharedMailboxForManager(db, mailbox.id, user));
}

/** Fork-only. Signed in; the route then checks the inbox with getSharedMailboxForManager. */
export async function requireSharingUser(request: Request) {
	const env = getEnv();
	try {
		return { env, user: await requireUser(env, request), error: null };
	} catch {
		return { env, user: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
	}
}

/**
 * Accounts a shared inbox can be given to: every enabled account except the inbox's owner, who already
 * has it. Upstream offered only accounts the acting admin had created, which left the list empty for
 * accounts made at setup or by another admin.
 */
export function shareableAccountsCondition(ownerUserId: string) {
	return and(eq(users.disabled, false), isNull(users.deletedAt), isPersonCondition(), ne(users.id, ownerUserId));
}
