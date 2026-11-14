// Fork-only. Queries shared by the groups API.
import { asc, count, eq } from "drizzle-orm";
import type { AppDatabase } from "#db";
import { domains, groupMembers, groups, mailboxGroupAccess, mailboxOwnerGroups, mailboxes, users } from "#db/schema";

export async function listGroups(db: AppDatabase) {
	const [rows, inboxCounts] = await Promise.all([
		db
			.select({
				id: groups.id,
				name: groups.name,
				description: groups.description,
				createdAt: groups.createdAt,
				memberCount: count(groupMembers.id),
			})
			.from(groups)
			.leftJoin(groupMembers, eq(groupMembers.groupId, groups.id))
			.groupBy(groups.id)
			.orderBy(asc(groups.name)),
		db
			.select({ groupId: mailboxGroupAccess.groupId, total: count() })
			.from(mailboxGroupAccess)
			.groupBy(mailboxGroupAccess.groupId),
	]);
	const inboxes = new Map(inboxCounts.map((row) => [row.groupId, row.total]));
	return rows.map((row) => ({ ...row, mailboxCount: inboxes.get(row.id) ?? 0 }));
}

/** Groups one account belongs to, with its role in each. */
export async function listGroupsForMember(db: AppDatabase, userId: string) {
	const mine = await db
		.select({ id: groups.id, name: groups.name, description: groups.description, role: groupMembers.role })
		.from(groupMembers)
		.innerJoin(groups, eq(groupMembers.groupId, groups.id))
		.where(eq(groupMembers.userId, userId))
		.orderBy(asc(groups.name));
	if (mine.length === 0) return [];
	const all = await listGroups(db);
	const counts = new Map(all.map((group) => [group.id, group]));
	return mine.map((group) => ({
		...group,
		memberCount: counts.get(group.id)?.memberCount ?? 0,
		mailboxCount: counts.get(group.id)?.mailboxCount ?? 0,
	}));
}

export async function getGroupDetail(db: AppDatabase, groupId: string) {
	const [group] = await db
		.select({ id: groups.id, name: groups.name, description: groups.description, createdAt: groups.createdAt })
		.from(groups)
		.where(eq(groups.id, groupId))
		.limit(1);
	if (!group) return null;
	const [members, sharedMailboxes] = await Promise.all([
		db
			.select({
				userId: users.id,
				name: users.name,
				email: users.email,
				role: groupMembers.role,
				disabled: users.disabled,
				addedAt: groupMembers.createdAt,
			})
			.from(groupMembers)
			.innerJoin(users, eq(groupMembers.userId, users.id))
			.where(eq(groupMembers.groupId, groupId))
			.orderBy(asc(users.name)),
		db
			.select({
				id: mailboxes.id,
				localPart: mailboxes.localPart,
				hostname: domains.hostname,
				displayName: mailboxes.displayName,
				permission: mailboxGroupAccess.permission,
				// Fork-only: whether this group owns the inbox (see #lib/groups/ownership).
				ownerGroupId: mailboxOwnerGroups.groupId,
			})
			.from(mailboxGroupAccess)
			.innerJoin(mailboxes, eq(mailboxGroupAccess.mailboxId, mailboxes.id))
			.leftJoin(mailboxOwnerGroups, eq(mailboxOwnerGroups.mailboxId, mailboxes.id))
			.innerJoin(domains, eq(mailboxes.domainId, domains.id))
			.where(eq(mailboxGroupAccess.groupId, groupId))
			.orderBy(asc(mailboxes.localPart)),
	]);
	return {
		...group,
		members,
		mailboxes: sharedMailboxes.map(({ ownerGroupId, ...mailbox }) => ({ ...mailbox, owned: ownerGroupId === groupId })),
	};
}
