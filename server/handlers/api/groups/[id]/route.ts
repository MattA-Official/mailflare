// Fork-only. Reads, renames and deletes one group. Deleting a group removes its members' access to
// the shared inboxes granted to it; their direct grants are untouched.
import { eq } from "drizzle-orm";
import { NextResponse } from "#lib/http/next-compat";
import { getDb } from "#db";
import { groups } from "#db/schema";
import { isUniqueConstraintError } from "#lib/database-errors";
import { authorizeGroupAdmin } from "#lib/groups/admin";
import { canManageGroups } from "#lib/groups/permissions";
import { getGroupDetail } from "#lib/groups/service";
import { createAuditLog } from "#lib/mailboxes/audit";
import { groupSchema } from "#lib/validators";
import type { GroupRouteParams } from "./types";

export async function GET(request: Request, { params }: GroupRouteParams) {
	const access = await authorizeGroupAdmin(request);
	if (access.error) return access.error;
	const group = await getGroupDetail(getDb(access.env), (await params).id);
	if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });
	return NextResponse.json({ group, canManage: canManageGroups(access.user) });
}

export async function PATCH(request: Request, { params }: GroupRouteParams) {
	const access = await authorizeGroupAdmin(request, { manage: true });
	if (access.error) return access.error;
	const parsed = groupSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ error: "Enter a group name" }, { status: 400 });
	const { id } = await params;
	const db = getDb(access.env);
	let updated: { id: string }[];
	try {
		updated = await db
			.update(groups)
			.set({ name: parsed.data.name, description: parsed.data.description || null })
			.where(eq(groups.id, id))
			.returning({ id: groups.id });
	} catch (error) {
		if (isUniqueConstraintError(error)) return NextResponse.json({ error: "A group with that name already exists" }, { status: 409 });
		throw error;
	}
	if (updated.length === 0) return NextResponse.json({ error: "Group not found" }, { status: 404 });
	await createAuditLog(access.env, { actorUserId: access.user.id, action: "group.updated", metadata: { groupId: id, name: parsed.data.name } });
	return NextResponse.json({ group: await getGroupDetail(db, id) });
}

export async function DELETE(request: Request, { params }: GroupRouteParams) {
	const access = await authorizeGroupAdmin(request, { manage: true });
	if (access.error) return access.error;
	const { id } = await params;
	const removed = await getDb(access.env).delete(groups).where(eq(groups.id, id)).returning({ id: groups.id, name: groups.name });
	if (removed.length === 0) return NextResponse.json({ error: "Group not found" }, { status: 404 });
	await createAuditLog(access.env, { actorUserId: access.user.id, action: "group.deleted", metadata: { groupId: id, name: removed[0]!.name } });
	return NextResponse.json({ ok: true });
}
