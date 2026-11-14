// Fork-only. Who can use a shared inbox, and why: its owner, people given it directly and the members of
// groups it is shared with (and of groups beneath them). Each person appears once, at their highest permission, with every route in.
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "#lib/http/next-compat";
import { getDb } from "#db";
import { groupMembers, groups, mailboxAccess, mailboxGroupAccess, users } from "#db/schema";
import { descendantsOf, loadGroupTree } from "#lib/groups/hierarchy";
import { listMailboxManagerGroupIds } from "#lib/groups/managers";
import { highestPermission } from "#lib/mailboxes/access";
import type { MailboxPermission } from "#lib/mailboxes/types";
import { getSharedMailboxForManager, requireSharingUser } from "../access/utils";
import type { MailboxAccessSummaryRouteParams } from "./types";
import { isPersonCondition } from "#lib/accounts/kind";

type Route = { kind: "owner" | "direct" | "group"; permission: MailboxPermission; groupId?: string; groupName?: string; managesInbox?: boolean; memberGroupId?: string; memberGroupName?: string };

export async function GET(request: Request, { params }: MailboxAccessSummaryRouteParams) {
	const access = await requireSharingUser(request);
	if (access.error) return access.error;
	const { id } = await params;
	const db = getDb(access.env);
	const mailbox = await getSharedMailboxForManager(db, id, access.user!);
	if (!mailbox) return NextResponse.json({ error: "Shared inbox not found" }, { status: 404 });

	const person = { userId: users.id, name: users.name, email: users.email, disabled: users.disabled };
	const [owner, direct, groupGrants, managerGroupIds] = await Promise.all([
		// Fork-only: a shared inbox's hidden holder is not a person and is not listed.
		db.select(person).from(users).where(and(eq(users.id, mailbox.userId), isPersonCondition())).limit(1),
		db
			.select({ ...person, permission: mailboxAccess.permission })
			.from(mailboxAccess)
			.innerJoin(users, eq(mailboxAccess.userId, users.id))
			.where(eq(mailboxAccess.mailboxId, id)),
		db
			.select({ permission: mailboxGroupAccess.permission, groupId: groups.id, groupName: groups.name })
			.from(mailboxGroupAccess)
			.innerJoin(groups, eq(mailboxGroupAccess.groupId, groups.id))
			.where(eq(mailboxGroupAccess.mailboxId, id)),
		listMailboxManagerGroupIds(db, id),
	]);

	const people = new Map<string, { userId: string; name: string; email: string; disabled: boolean; routes: Route[] }>();
	const add = (row: { userId: string; name: string; email: string; disabled: boolean }, route: Route) => {
		const entry = people.get(row.userId) ?? { userId: row.userId, name: row.name, email: row.email, disabled: row.disabled, routes: [] };
		entry.routes.push(route);
		people.set(row.userId, entry);
	};
	for (const row of owner) add(row, { kind: "owner", permission: "full_access" });
	for (const row of direct) add(row, { kind: "direct", permission: row.permission });
	// Fork-only (nested groups): a grant reaches the members of the group and of every group beneath it.
	const tree = groupGrants.length ? await loadGroupTree(db) : null;
	const reach = tree ? groupGrants.map((grant) => ({ grant, groupIds: descendantsOf(tree, grant.groupId) })) : [];
	const reachedIds = [...new Set(reach.flatMap((entry) => [...entry.groupIds]))];
	const memberRows = reachedIds.length
		? await db
			.select({ ...person, memberGroupId: groupMembers.groupId })
			.from(groupMembers)
			.innerJoin(users, eq(groupMembers.userId, users.id))
			.where(inArray(groupMembers.groupId, reachedIds))
		: [];
	for (const row of memberRows) {
		for (const { grant, groupIds } of reach) {
			if (!groupIds.has(row.memberGroupId)) continue;
			const nested = row.memberGroupId !== grant.groupId;
			add(row, {
				kind: "group",
				permission: grant.permission,
				groupId: grant.groupId,
				groupName: grant.groupName,
				managesInbox: managerGroupIds.includes(grant.groupId),
				...(nested ? { memberGroupId: row.memberGroupId, memberGroupName: tree?.names.get(row.memberGroupId) ?? "" } : {}),
			});
		}
	}

	const summary = [...people.values()]
		.map((entry) => ({ ...entry, permission: highestPermission(entry.routes.map((route) => route.permission))! }))
		.sort((a, b) => a.name.localeCompare(b.name));
	return NextResponse.json({ people: summary });
}
