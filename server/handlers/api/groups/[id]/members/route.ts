// Fork-only. Adds and removes the members of a group.
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "#lib/http/next-compat";
import { getDb } from "#db";
import { groupMembers, groups, users } from "#db/schema";
import { authorizeGroupAdmin } from "#lib/groups/admin";
import { newId } from "#lib/ids";
import { createAuditLog } from "#lib/mailboxes/audit";
import { groupMemberSchema } from "#lib/validators";
import type { GroupRouteParams } from "./types";

export async function POST(request: Request, { params }: GroupRouteParams) {
	const access = await authorizeGroupAdmin(request, { manage: true });
	if (access.error) return access.error;
	const parsed = groupMemberSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ error: "Choose a valid account" }, { status: 400 });
	const { id } = await params;
	const db = getDb(access.env);
	const [group] = await db.select({ id: groups.id }).from(groups).where(eq(groups.id, id)).limit(1);
	if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });
	const [user] = await db
		.select({ id: users.id })
		.from(users)
		.where(and(eq(users.id, parsed.data.userId), eq(users.disabled, false), isNull(users.deletedAt)))
		.limit(1);
	if (!user) return NextResponse.json({ error: "Account not found" }, { status: 404 });

	const inserted = await db
		.insert(groupMembers)
		.values({ id: newId("gmb"), groupId: id, userId: user.id, addedByUserId: access.user.id })
		.onConflictDoNothing({ target: [groupMembers.groupId, groupMembers.userId] })
		.returning({ id: groupMembers.id });
	if (inserted.length > 0) {
		await createAuditLog(access.env, { actorUserId: access.user.id, targetUserId: user.id, action: "group.member_added", metadata: { groupId: id } });
	}
	return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: GroupRouteParams) {
	const access = await authorizeGroupAdmin(request, { manage: true });
	if (access.error) return access.error;
	const userId = new URL(request.url).searchParams.get("userId");
	if (!userId) return NextResponse.json({ error: "Account is required" }, { status: 400 });
	const { id } = await params;
	const removed = await getDb(access.env)
		.delete(groupMembers)
		.where(and(eq(groupMembers.groupId, id), eq(groupMembers.userId, userId)))
		.returning({ id: groupMembers.id });
	if (removed.length > 0) {
		await createAuditLog(access.env, { actorUserId: access.user.id, targetUserId: userId, action: "group.member_removed", metadata: { groupId: id } });
	}
	return NextResponse.json({ ok: true });
}
