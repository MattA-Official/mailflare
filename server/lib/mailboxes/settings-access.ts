import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "#db";
import { mailboxes, users } from "#db/schema";
import { canManageUserAccount, canManageUsers } from "#lib/auth/admin";
import type { SessionUser } from "#lib/auth/types";
import { canManageSharedInbox } from "#lib/groups/permissions";
import { getMailboxAccessLevel } from "./access";

/** Configuration access does not grant permission to read or send mail. */
export async function getMailboxSettingsAccess(
	env: CloudflareEnv,
	user: Pick<SessionUser, "id" | "role" | "isPrimaryAdmin" | "canManageUsers" | "canManageMailboxes">,
	mailboxId: string,
) {
	const db = getDb(env);
	const access = await getMailboxAccessLevel(db, user, mailboxId);
	if (access?.canManage || user.role !== "admin") return access;

	const [owner] = await db
		.select({ role: users.role, isPrimaryAdmin: users.isPrimaryAdmin, userId: mailboxes.userId, type: mailboxes.type })
		.from(mailboxes)
		.innerJoin(users, eq(mailboxes.userId, users.id))
		.where(and(eq(mailboxes.id, mailboxId), eq(mailboxes.disabled, false), isNull(users.deletedAt)))
		.limit(1);
	if (!owner) return access;
	// Fork-only: admins who may manage a shared inbox's access may also configure it.
	if (canManageSharedInbox(user, owner)) return { permission: access?.permission ?? null, canRead: true, canManage: true };
	if (!canManageUsers(user) || !canManageUserAccount(user, owner)) {
		return access;
	}

	return { permission: access?.permission ?? null, canRead: true, canManage: true };
}
