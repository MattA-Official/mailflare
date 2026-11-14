// Fork-only: shared inboxes owned by a group. The owning group always holds full access through an
// ordinary mailbox_group_access row, so the access resolver needs nothing extra. Ownership itself decides
// what happens when the admin account holding the inbox (mailboxes.user_id) is deleted: the inbox moves to
// the primary admin instead of going with that account.
import { and, eq, inArray } from "drizzle-orm";
import type { AppDatabase } from "#db";
import { getDb } from "#db";
import { mailboxGroupAccess, mailboxOwnerGroups, mailboxes, users } from "#db/schema";
import { newId } from "#lib/ids";
import { createAuditLogs } from "#lib/mailboxes/audit";

export async function getMailboxOwnerGroupId(db: AppDatabase, mailboxId: string): Promise<string | null> {
	const [row] = await db.select({ groupId: mailboxOwnerGroups.groupId }).from(mailboxOwnerGroups).where(eq(mailboxOwnerGroups.mailboxId, mailboxId)).limit(1);
	return row?.groupId ?? null;
}

/** Makes a group the owner of a shared inbox and gives it full access. Any previous owning group keeps its grant. */
export async function setMailboxOwnerGroup(db: AppDatabase, mailboxId: string, groupId: string, actorId: string): Promise<void> {
	await db
		.insert(mailboxGroupAccess)
		.values({ id: newId("mga"), mailboxId, groupId, permission: "full_access", createdByUserId: actorId })
		.onConflictDoUpdate({
			target: [mailboxGroupAccess.mailboxId, mailboxGroupAccess.groupId],
			set: { permission: "full_access", createdByUserId: actorId },
		});
	await db
		.insert(mailboxOwnerGroups)
		.values({ mailboxId, groupId, assignedByUserId: actorId })
		.onConflictDoUpdate({ target: mailboxOwnerGroups.mailboxId, set: { groupId, assignedByUserId: actorId, createdAt: new Date() } });
}

/** Ends group ownership. The group keeps its full-access grant until it is removed separately. */
export async function clearMailboxOwnerGroup(db: AppDatabase, mailboxId: string): Promise<boolean> {
	const removed = await db.delete(mailboxOwnerGroups).where(eq(mailboxOwnerGroups.mailboxId, mailboxId)).returning({ mailboxId: mailboxOwnerGroups.mailboxId });
	return removed.length > 0;
}

/**
 * Moves group-owned shared inboxes held by any of `fromUserIds` to the primary admin. Called when accounts
 * are deleted and again before they are purged, so a group's inbox outlives the admin who created it.
 * Inboxes on a domain owned by a deleted account still go when that domain does.
 */
export async function moveGroupOwnedMailboxes(env: CloudflareEnv, fromUserIds: string[], actorId: string | null): Promise<number> {
	if (!fromUserIds.length) return 0;
	const db = getDb(env);
	const held = await db
		.select({ id: mailboxes.id, userId: mailboxes.userId, groupId: mailboxOwnerGroups.groupId })
		.from(mailboxes)
		.innerJoin(mailboxOwnerGroups, eq(mailboxOwnerGroups.mailboxId, mailboxes.id))
		.where(and(inArray(mailboxes.userId, fromUserIds), eq(mailboxes.type, "shared")));
	if (!held.length) return 0;
	const [primary] = await db.select({ id: users.id }).from(users).where(eq(users.isPrimaryAdmin, true)).limit(1);
	if (!primary || fromUserIds.includes(primary.id)) return 0;
	await db.update(mailboxes).set({ userId: primary.id }).where(inArray(mailboxes.id, held.map((row) => row.id)));
	await createAuditLogs(env, held.map((row) => ({
		actorUserId: actorId,
		mailboxId: row.id,
		action: "mailbox.owner_moved",
		metadata: { fromUserId: row.userId, toUserId: primary.id, groupId: row.groupId },
	})));
	return held.length;
}
