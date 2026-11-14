// Fork-only: share a shared inbox with a group. Members get the group's permission, or their own direct
// grant if it is higher (see #lib/mailboxes/access).
import { and, asc, count, eq } from "drizzle-orm";
import { NextResponse } from "#lib/http/next-compat";
import { getDb } from "#db";
import { groupMembers, groups, mailboxGroupAccess } from "#db/schema";
import { requireTeamSharingAdmin } from "#handlers/api/accounts/utils";
import { newId } from "#lib/ids";
import { createAuditLog } from "#lib/mailboxes/audit";
import { mailboxGroupAccessSchema } from "#lib/validators";
import { getSharedMailboxForAdmin } from "../access/utils";
import type { MailboxGroupAccessRouteParams } from "./types";

export async function GET(request: Request, { params }: MailboxGroupAccessRouteParams) {
	const access = await requireTeamSharingAdmin(request);
	if (access.error) return access.error;
	const { id } = await params;
	const db = getDb(access.env);
	const mailbox = await getSharedMailboxForAdmin(db, id, access.user!);
	if (!mailbox) return NextResponse.json({ error: "Shared inbox not found" }, { status: 404 });

	const [grants, availableGroups] = await Promise.all([
		db
			.select({
				id: mailboxGroupAccess.id,
				groupId: groups.id,
				groupName: groups.name,
				permission: mailboxGroupAccess.permission,
				createdAt: mailboxGroupAccess.createdAt,
			})
			.from(mailboxGroupAccess)
			.innerJoin(groups, eq(mailboxGroupAccess.groupId, groups.id))
			.where(eq(mailboxGroupAccess.mailboxId, id))
			.orderBy(asc(groups.name)),
		db
			.select({ id: groups.id, name: groups.name, memberCount: count(groupMembers.id) })
			.from(groups)
			.leftJoin(groupMembers, eq(groupMembers.groupId, groups.id))
			.groupBy(groups.id)
			.orderBy(asc(groups.name)),
	]);
	const memberCounts = new Map(availableGroups.map((group) => [group.id, group.memberCount]));

	return NextResponse.json({
		groups: grants.map((grant) => ({ ...grant, memberCount: memberCounts.get(grant.groupId) ?? 0 })),
		availableGroups,
	});
}

export async function POST(request: Request, { params }: MailboxGroupAccessRouteParams) {
	const access = await requireTeamSharingAdmin(request);
	if (access.error) return access.error;
	const parsed = mailboxGroupAccessSchema.safeParse(await request.json());
	if (!parsed.success) return NextResponse.json({ error: "Choose a valid group" }, { status: 400 });
	const { id } = await params;
	const db = getDb(access.env);
	const mailbox = await getSharedMailboxForAdmin(db, id, access.user!);
	if (!mailbox) return NextResponse.json({ error: "Shared inbox not found" }, { status: 404 });
	const [group] = await db.select({ id: groups.id, name: groups.name }).from(groups).where(eq(groups.id, parsed.data.groupId)).limit(1);
	if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

	await db
		.insert(mailboxGroupAccess)
		.values({
			id: newId("mga"),
			mailboxId: id,
			groupId: group.id,
			permission: parsed.data.permission,
			createdByUserId: access.user!.id,
		})
		.onConflictDoUpdate({
			target: [mailboxGroupAccess.mailboxId, mailboxGroupAccess.groupId],
			set: { permission: parsed.data.permission, createdByUserId: access.user!.id },
		});
	await createAuditLog(access.env, {
		actorUserId: access.user!.id,
		mailboxId: id,
		action: "mailbox.group_access_granted",
		metadata: { groupId: group.id, groupName: group.name, permission: parsed.data.permission },
	});
	return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: MailboxGroupAccessRouteParams) {
	const access = await requireTeamSharingAdmin(request);
	if (access.error) return access.error;
	const { id } = await params;
	const groupId = new URL(request.url).searchParams.get("groupId");
	if (!groupId) return NextResponse.json({ error: "Group is required" }, { status: 400 });
	const db = getDb(access.env);
	const mailbox = await getSharedMailboxForAdmin(db, id, access.user!);
	if (!mailbox) return NextResponse.json({ error: "Shared inbox not found" }, { status: 404 });
	const removed = await db
		.delete(mailboxGroupAccess)
		.where(and(eq(mailboxGroupAccess.mailboxId, id), eq(mailboxGroupAccess.groupId, groupId)))
		.returning({ id: mailboxGroupAccess.id });
	if (removed.length > 0) {
		await createAuditLog(access.env, {
			actorUserId: access.user!.id,
			mailboxId: id,
			action: "mailbox.group_access_revoked",
			metadata: { groupId },
		});
	}
	return NextResponse.json({ ok: true });
}
