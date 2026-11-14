// Fork-only: groups inside groups (migration 0092, table group_subgroups). A group can sit inside several
// groups and hold several sub-groups. Anything shared with a group reaches the members of every group
// beneath it at the same level; a parent gets nothing from its sub-groups. Links never form a loop (checked
// on insert), and the recursive queries use UNION rather than UNION ALL, so one would still terminate.
import { and, eq, sql, type SQL } from "drizzle-orm";
import type { AppDatabase } from "#db";
import { groupSubgroups, groups } from "#db/schema";

/**
 * A subquery of every group whose grants reach this user: the groups they belong to and everything above
 * those. Use as `inArray(table.groupId, effectiveGroupIds(userId))`.
 */
export function effectiveGroupIds(userId: string): SQL {
	return sql`(WITH RECURSIVE reach(id) AS (
		SELECT group_id FROM group_members WHERE user_id = ${userId}
		UNION
		SELECT link.parent_group_id FROM group_subgroups link INNER JOIN reach ON link.child_group_id = reach.id
	) SELECT id FROM reach)`;
}

/** A subquery of every group a shared inbox reaches: the groups it is granted to and everything beneath them. */
export function mailboxReachedGroupIds(mailboxId: string): SQL {
	return sql`(WITH RECURSIVE down(id) AS (
		SELECT group_id FROM mailbox_group_access WHERE mailbox_id = ${mailboxId}
		UNION
		SELECT link.child_group_id FROM group_subgroups link INNER JOIN down ON link.parent_group_id = down.id
	) SELECT id FROM down)`;
}

export type GroupTree = { names: Map<string, string>; children: Map<string, string[]>; parents: Map<string, string[]> };

export async function loadGroupTree(db: AppDatabase): Promise<GroupTree> {
	const [rows, links] = await Promise.all([
		db.select({ id: groups.id, name: groups.name }).from(groups),
		db.select({ parent: groupSubgroups.parentGroupId, child: groupSubgroups.childGroupId }).from(groupSubgroups),
	]);
	const children = new Map<string, string[]>();
	const parents = new Map<string, string[]>();
	for (const link of links) {
		children.set(link.parent, [...(children.get(link.parent) ?? []), link.child]);
		parents.set(link.child, [...(parents.get(link.child) ?? []), link.parent]);
	}
	return { names: new Map(rows.map((row) => [row.id, row.name])), children, parents };
}

function walk(edges: Map<string, string[]>, start: string): Set<string> {
	const seen = new Set<string>([start]);
	const queue = [start];
	while (queue.length) {
		for (const next of edges.get(queue.shift()!) ?? []) {
			if (seen.has(next)) continue;
			seen.add(next);
			queue.push(next);
		}
	}
	return seen;
}

/** The group and every group beneath it, at any depth. */
export function descendantsOf(tree: GroupTree, groupId: string): Set<string> {
	return walk(tree.children, groupId);
}

/** The group and every group above it, at any depth. */
export function ancestorsOf(tree: GroupTree, groupId: string): Set<string> {
	return walk(tree.parents, groupId);
}

/** Whether `childId` can go inside `parentId` without a loop: different groups, and the parent is not beneath the child. */
export function canNest(tree: GroupTree, parentId: string, childId: string): boolean {
	if (parentId === childId || !tree.names.has(parentId) || !tree.names.has(childId)) return false;
	return !descendantsOf(tree, childId).has(parentId);
}

export async function addSubgroup(db: AppDatabase, parentId: string, childId: string, actorId: string): Promise<void> {
	await db.insert(groupSubgroups).values({ parentGroupId: parentId, childGroupId: childId, addedByUserId: actorId }).onConflictDoNothing();
}

export async function removeSubgroup(db: AppDatabase, parentId: string, childId: string): Promise<boolean> {
	const removed = await db
		.delete(groupSubgroups)
		.where(and(eq(groupSubgroups.parentGroupId, parentId), eq(groupSubgroups.childGroupId, childId)))
		.returning({ child: groupSubgroups.childGroupId });
	return removed.length > 0;
}
