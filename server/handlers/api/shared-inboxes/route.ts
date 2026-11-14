// Fork-only: every shared inbox on the instance, for the admins who manage shared inboxes, including ones
// deleted but still restorable. Shared inboxes hold themselves (#lib/mailboxes/principals), so an admin may
// have no grant to some of them; this list is how they find those.
import { and, count, eq, inArray } from "drizzle-orm";
import { NextResponse } from "#lib/http/next-compat";
import { getDb } from "#db";
import { domains, groups, mailboxAccess, mailboxGroupAccess, mailboxManagers, mailboxes, users } from "#db/schema";
import { getAccountPurgeDate } from "#lib/accounts/deletion-utils";
import { canManageSharedInbox } from "#lib/groups/permissions";
import { requireSharingUser } from "#handlers/api/mailboxes/[id]/access/utils";

export async function GET(request: Request) {
	const access = await requireSharingUser(request);
	if (access.error) return access.error;
	if (!canManageSharedInbox(access.user!, { userId: "", type: "shared" })) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	const db = getDb(access.env);
	const rows = await db
		.select({
			id: mailboxes.id,
			localPart: mailboxes.localPart,
			hostname: domains.hostname,
			displayName: mailboxes.displayName,
			disabled: mailboxes.disabled,
			createdAt: mailboxes.createdAt,
			deletedAt: users.deletedAt,
		})
		.from(mailboxes)
		.innerJoin(domains, eq(mailboxes.domainId, domains.id))
		.innerJoin(users, eq(mailboxes.userId, users.id))
		.where(eq(mailboxes.type, "shared"))
		.orderBy(mailboxes.localPart);
	const ids = rows.map((row) => row.id);
	const [people, groupGrants, managers] = ids.length
		? await Promise.all([
			db.select({ mailboxId: mailboxAccess.mailboxId, total: count() }).from(mailboxAccess).where(inArray(mailboxAccess.mailboxId, ids)).groupBy(mailboxAccess.mailboxId),
			db.select({ mailboxId: mailboxGroupAccess.mailboxId, total: count() }).from(mailboxGroupAccess).where(inArray(mailboxGroupAccess.mailboxId, ids)).groupBy(mailboxGroupAccess.mailboxId),
			db
				.select({ mailboxId: mailboxManagers.mailboxId, groupId: groups.id, name: groups.name })
				.from(mailboxManagers)
				.innerJoin(groups, eq(mailboxManagers.groupId, groups.id))
				.where(and(inArray(mailboxManagers.mailboxId, ids))),
		])
		: [[], [], []];
	const peopleBy = new Map(people.map((row) => [row.mailboxId, row.total]));
	const groupsBy = new Map(groupGrants.map((row) => [row.mailboxId, row.total]));
	return NextResponse.json({
		inboxes: rows.map((row) => ({
			id: row.id,
			address: `${row.localPart}@${row.hostname}`,
			displayName: row.displayName,
			createdAt: row.createdAt,
			deleted: row.disabled && !!row.deletedAt,
			disabled: row.disabled,
			purgeAt: row.deletedAt ? getAccountPurgeDate(row.deletedAt) : null,
			peopleCount: peopleBy.get(row.id) ?? 0,
			groupCount: groupsBy.get(row.id) ?? 0,
			managers: managers.filter((manager) => manager.mailboxId === row.id).map(({ groupId, name }) => ({ id: groupId, name })),
		})),
	});
}
