// Fork-only. Queries shared by the groups API.
import { asc, count, eq, inArray } from "drizzle-orm";
import type { AppDatabase } from "#db";
import { domains, groupMembers, groups, mailboxGroupAccess, mailboxOwnerGroups, mailboxes, users } from "#db/schema";
import { ancestorsOf, canNest, descendantsOf, loadGroupTree } from "./hierarchy";

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
	// Fork-only (nested groups): inboxes granted to a group above this one reach its members too.
	const tree = await loadGroupTree(db);
	const reachingIds = [...ancestorsOf(tree, groupId)];
	const [members, grants, subgroupCounts] = await Promise.all([
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
				grantGroupId: mailboxGroupAccess.groupId,
				// Fork-only: whether this group owns the inbox (see #lib/groups/ownership).
				ownerGroupId: mailboxOwnerGroups.groupId,
			})
			.from(mailboxGroupAccess)
			.innerJoin(mailboxes, eq(mailboxGroupAccess.mailboxId, mailboxes.id))
			.leftJoin(mailboxOwnerGroups, eq(mailboxOwnerGroups.mailboxId, mailboxes.id))
			.innerJoin(domains, eq(mailboxes.domainId, domains.id))
			.where(inArray(mailboxGroupAccess.groupId, reachingIds))
			.orderBy(asc(mailboxes.localPart)),
		db
			.select({ groupId: groupMembers.groupId, total: count() })
			.from(groupMembers)
			.groupBy(groupMembers.groupId),
	]);
	// One row per inbox at its highest level; a grant to this group itself wins a tie with an inherited one.
	const rank = { read_only: 1, send_on_behalf: 2, send_as: 3, full_access: 4 } as const;
	const byMailbox = new Map<string, (typeof grants)[number]>();
	for (const row of grants) {
		const existing = byMailbox.get(row.id);
		const better = !existing
			|| rank[row.permission] > rank[existing.permission]
			|| (rank[row.permission] === rank[existing.permission] && row.grantGroupId === groupId);
		if (better) byMailbox.set(row.id, row);
	}
	const memberCounts = new Map(subgroupCounts.map((row) => [row.groupId, row.total]));
	const link = (id: string) => ({ id, name: tree.names.get(id) ?? "", memberCount: memberCounts.get(id) ?? 0 });
	const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
	const beneath = descendantsOf(tree, groupId);
	return {
		...group,
		// Fork-only (nested groups): the groups this one sits inside, and the groups inside it.
		parents: (tree.parents.get(groupId) ?? []).map(link).sort(byName),
		subgroups: (tree.children.get(groupId) ?? []).map(link).sort(byName),
		// Groups that could go inside this one: not already beneath it, and not making a loop.
		subgroupOptions: [...tree.names.keys()]
			.filter((id) => !beneath.has(id) && canNest(tree, groupId, id))
			.map(link)
			.sort(byName),
		members,
		mailboxes: [...byMailbox.values()].map(({ ownerGroupId, grantGroupId, ...mailbox }) => ({
			...mailbox,
			owned: ownerGroupId === groupId,
			inheritedFrom: grantGroupId === groupId ? null : { id: grantGroupId, name: tree.names.get(grantGroupId) ?? "" },
		})),
	};
}
