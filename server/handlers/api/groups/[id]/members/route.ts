// Fork-only. Adds and removes the members of a group, and chooses its managers. Account managers may do
// all of it; a group's own managers may add and remove its ordinary members.
import { and, asc, eq, isNull, notInArray } from "drizzle-orm";
import { NextResponse } from "#lib/http/next-compat";
import { getDb } from "#db";
import { groupMembers, groups, users } from "#db/schema";
import { authorizeGroupAccess } from "#lib/groups/admin";
import { newId } from "#lib/ids";
import { createAuditLog } from "#lib/mailboxes/audit";
import { groupMemberRoleSchema, groupMemberSchema } from "#lib/validators";
import type { GroupRouteParams } from "./types";
import { isPersonCondition } from "#lib/accounts/kind";

/** Accounts that can be added: enabled, not deleted and not already in the group. */
export async function GET(request: Request, { params }: GroupRouteParams) {
	const { id } = await params;
	const access = await authorizeGroupAccess(request, id, "members");
	if (access.error) return access.error;
	const db = getDb(access.env);
	const existing = db.select({ userId: groupMembers.userId }).from(groupMembers).where(eq(groupMembers.groupId, id));
	const candidates = await db
		.select({ id: users.id, name: users.name, email: users.email })
		.from(users)
		.where(and(eq(users.disabled, false), isNull(users.deletedAt), isPersonCondition(), notInArray(users.id, existing)))
		.orderBy(asc(users.name));
	return NextResponse.json({ candidates });
}

export async function POST(request: Request, { params }: GroupRouteParams) {
	const { id } = await params;
	const access = await authorizeGroupAccess(request, id, "members");
	if (access.error) return access.error;
	const parsed = groupMemberSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ error: "Choose a valid account" }, { status: 400 });
	if (parsed.data.role === "manager" && !access.canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	const db = getDb(access.env);
	const [group] = await db.select({ id: groups.id }).from(groups).where(eq(groups.id, id)).limit(1);
	if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });
	const [user] = await db
		.select({ id: users.id })
		.from(users)
		.where(and(eq(users.id, parsed.data.userId), eq(users.disabled, false), isNull(users.deletedAt), isPersonCondition()))
		.limit(1);
	if (!user) return NextResponse.json({ error: "Account not found" }, { status: 404 });

	const inserted = await db
		.insert(groupMembers)
		.values({ id: newId("gmb"), groupId: id, userId: user.id, role: parsed.data.role ?? "member", addedByUserId: access.user.id })
		.onConflictDoNothing({ target: [groupMembers.groupId, groupMembers.userId] })
		.returning({ id: groupMembers.id });
	if (inserted.length > 0) {
		await createAuditLog(access.env, { actorUserId: access.user.id, targetUserId: user.id, action: "group.member_added", metadata: { groupId: id } });
	}
	return NextResponse.json({ ok: true });
}

/** Makes a member a manager or back. Account managers only. */
export async function PATCH(request: Request, { params }: GroupRouteParams) {
	const { id } = await params;
	const access = await authorizeGroupAccess(request, id, "members");
	if (access.error) return access.error;
	if (!access.canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	const parsed = groupMemberRoleSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ error: "Choose a valid role" }, { status: 400 });
	const updated = await getDb(access.env)
		.update(groupMembers)
		.set({ role: parsed.data.role })
		.where(and(eq(groupMembers.groupId, id), eq(groupMembers.userId, parsed.data.userId)))
		.returning({ id: groupMembers.id });
	if (updated.length === 0) return NextResponse.json({ error: "Member not found" }, { status: 404 });
	await createAuditLog(access.env, {
		actorUserId: access.user.id,
		targetUserId: parsed.data.userId,
		action: "group.member_role_changed",
		metadata: { groupId: id, role: parsed.data.role },
	});
	return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: GroupRouteParams) {
	const { id } = await params;
	const access = await authorizeGroupAccess(request, id, "members");
	if (access.error) return access.error;
	const userId = new URL(request.url).searchParams.get("userId");
	if (!userId) return NextResponse.json({ error: "Account is required" }, { status: 400 });
	const db = getDb(access.env);
	const conditions = [eq(groupMembers.groupId, id), eq(groupMembers.userId, userId)];
	// A group manager removes ordinary members only; managers are chosen and removed by account managers.
	if (!access.canManage) conditions.push(eq(groupMembers.role, "member"));
	const removed = await db.delete(groupMembers).where(and(...conditions)).returning({ id: groupMembers.id });
	if (removed.length === 0 && !access.canManage) {
		const [target] = await db.select({ id: groupMembers.id }).from(groupMembers).where(and(eq(groupMembers.groupId, id), eq(groupMembers.userId, userId))).limit(1);
		if (target) return NextResponse.json({ error: "Only an administrator can remove a group manager" }, { status: 403 });
	}
	if (removed.length > 0) {
		await createAuditLog(access.env, { actorUserId: access.user.id, targetUserId: userId, action: "group.member_removed", metadata: { groupId: id } });
	}
	return NextResponse.json({ ok: true });
}
