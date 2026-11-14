// Fork-only: groups that manage a shared inbox (migration 0095). Shared inboxes hold themselves
// (#lib/mailboxes/principals), so no group or person owns one; any number of groups can manage it. A managing
// group always holds full access through an ordinary mailbox_group_access row, so the access resolver needs
// nothing extra, and that row cannot be downgraded or removed while the group manages the inbox.
import { and, eq } from "drizzle-orm";
import type { AppDatabase } from "#db";
import { mailboxGroupAccess, mailboxManagers } from "#db/schema";
import { newId } from "#lib/ids";

export async function listMailboxManagerGroupIds(db: AppDatabase, mailboxId: string): Promise<string[]> {
	const rows = await db.select({ groupId: mailboxManagers.groupId }).from(mailboxManagers).where(eq(mailboxManagers.mailboxId, mailboxId));
	return rows.map((row) => row.groupId);
}

export async function isMailboxManagerGroup(db: AppDatabase, mailboxId: string, groupId: string): Promise<boolean> {
	const [row] = await db
		.select({ groupId: mailboxManagers.groupId })
		.from(mailboxManagers)
		.where(and(eq(mailboxManagers.mailboxId, mailboxId), eq(mailboxManagers.groupId, groupId)))
		.limit(1);
	return !!row;
}

/** Makes a group a manager of a shared inbox and gives it full access. */
export async function addMailboxManager(db: AppDatabase, mailboxId: string, groupId: string, actorId: string): Promise<void> {
	await db
		.insert(mailboxGroupAccess)
		.values({ id: newId("mga"), mailboxId, groupId, permission: "full_access", createdByUserId: actorId })
		.onConflictDoUpdate({
			target: [mailboxGroupAccess.mailboxId, mailboxGroupAccess.groupId],
			set: { permission: "full_access", createdByUserId: actorId },
		});
	await db.insert(mailboxManagers).values({ mailboxId, groupId, createdByUserId: actorId }).onConflictDoNothing();
}

/** Stops a group managing an inbox. It keeps its full-access grant until that is removed separately. */
export async function removeMailboxManager(db: AppDatabase, mailboxId: string, groupId: string): Promise<boolean> {
	const removed = await db
		.delete(mailboxManagers)
		.where(and(eq(mailboxManagers.mailboxId, mailboxId), eq(mailboxManagers.groupId, groupId)))
		.returning({ groupId: mailboxManagers.groupId });
	return removed.length > 0;
}
