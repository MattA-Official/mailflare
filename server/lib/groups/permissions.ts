import { canManageUsers, isPrimaryAdmin } from "#lib/auth/admin";
import type { SessionUser } from "#lib/auth/types";

type Actor = Pick<SessionUser, "id" | "role" | "isPrimaryAdmin" | "canManageUsers" | "canManageMailboxes">;

/** Fork-only. Creating, renaming and deleting groups and changing their members follows account management. */
export function canManageGroups(user: Pick<SessionUser, "role" | "isPrimaryAdmin" | "canManageUsers">): boolean {
	return canManageUsers(user);
}

/**
 * Fork-only. Who may grant and revoke access to a shared inbox. Upstream allowed only the admin who
 * owns it; here the primary admin and any admin trusted with mailboxes or accounts may as well.
 */
export function canManageSharedInbox(user: Actor, mailbox: { userId: string; type: string }): boolean {
	if (user.role !== "admin" || mailbox.type !== "shared") return false;
	return mailbox.userId === user.id || isPrimaryAdmin(user) || user.canManageMailboxes || user.canManageUsers;
}

/** Fork-only. Any admin may see the groups, since any admin who owns a shared inbox may share it with one. */
export function canViewGroups(user: Pick<SessionUser, "role">): boolean {
	return user.role === "admin";
}
