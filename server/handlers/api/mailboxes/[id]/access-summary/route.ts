// Fork-only. Who can use a shared inbox, and why: its owner, people given it directly and the members of
// groups it is shared with. Each person appears once, at their highest permission, with every route in.
import { eq } from "drizzle-orm";
import { NextResponse } from "#lib/http/next-compat";
import { getDb } from "#db";
import { groupMembers, groups, mailboxAccess, mailboxGroupAccess, users } from "#db/schema";
import { requireTeamSharingAdmin } from "#handlers/api/accounts/utils";
import { highestPermission } from "#lib/mailboxes/access";
import type { MailboxPermission } from "#lib/mailboxes/types";
import { getSharedMailboxForAdmin } from "../access/utils";
import type { MailboxAccessSummaryRouteParams } from "./types";

type Route = { kind: "owner" | "direct" | "group"; permission: MailboxPermission; groupId?: string; groupName?: string };

export async function GET(request: Request, { params }: MailboxAccessSummaryRouteParams) {
	const access = await requireTeamSharingAdmin(request);
	if (access.error) return access.error;
	const { id } = await params;
	const db = getDb(access.env);
	const mailbox = await getSharedMailboxForAdmin(db, id, access.user!);
	if (!mailbox) return NextResponse.json({ error: "Shared inbox not found" }, { status: 404 });

	const person = { userId: users.id, name: users.name, email: users.email, disabled: users.disabled };
	const [owner, direct, viaGroups] = await Promise.all([
		db.select(person).from(users).where(eq(users.id, mailbox.userId)).limit(1),
		db
			.select({ ...person, permission: mailboxAccess.permission })
			.from(mailboxAccess)
			.innerJoin(users, eq(mailboxAccess.userId, users.id))
			.where(eq(mailboxAccess.mailboxId, id)),
		db
			.select({ ...person, permission: mailboxGroupAccess.permission, groupId: groups.id, groupName: groups.name })
			.from(mailboxGroupAccess)
			.innerJoin(groups, eq(mailboxGroupAccess.groupId, groups.id))
			.innerJoin(groupMembers, eq(groupMembers.groupId, groups.id))
			.innerJoin(users, eq(groupMembers.userId, users.id))
			.where(eq(mailboxGroupAccess.mailboxId, id)),
	]);

	const people = new Map<string, { userId: string; name: string; email: string; disabled: boolean; routes: Route[] }>();
	const add = (row: { userId: string; name: string; email: string; disabled: boolean }, route: Route) => {
		const entry = people.get(row.userId) ?? { userId: row.userId, name: row.name, email: row.email, disabled: row.disabled, routes: [] };
		entry.routes.push(route);
		people.set(row.userId, entry);
	};
	for (const row of owner) add(row, { kind: "owner", permission: "full_access" });
	for (const row of direct) add(row, { kind: "direct", permission: row.permission });
	for (const row of viaGroups) add(row, { kind: "group", permission: row.permission, groupId: row.groupId, groupName: row.groupName });

	const summary = [...people.values()]
		.map((entry) => ({ ...entry, permission: highestPermission(entry.routes.map((route) => route.permission))! }))
		.sort((a, b) => a.name.localeCompare(b.name));
	return NextResponse.json({ people: summary });
}
