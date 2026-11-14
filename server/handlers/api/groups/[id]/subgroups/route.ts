// Fork-only. Puts a group inside this one, or takes it out. A sub-group gets everything shared with this
// group; nothing passes back up. Only admins who manage groups may change the links.
import { NextResponse } from "#lib/http/next-compat";
import { getDb } from "#db";
import { authorizeGroupAdmin } from "#lib/groups/admin";
import { addSubgroup, canNest, loadGroupTree, removeSubgroup } from "#lib/groups/hierarchy";
import { getGroupDetail } from "#lib/groups/service";
import { createAuditLog } from "#lib/mailboxes/audit";
import { subgroupSchema } from "#lib/validators";
import type { GroupSubgroupsRouteParams } from "./types";

export async function POST(request: Request, { params }: GroupSubgroupsRouteParams) {
	const access = await authorizeGroupAdmin(request, { manage: true });
	if (access.error) return access.error;
	const parsed = subgroupSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ error: "Choose a group" }, { status: 400 });
	const { id } = await params;
	const db = getDb(access.env);
	const tree = await loadGroupTree(db);
	if (!tree.names.has(id) || !tree.names.has(parsed.data.groupId)) return NextResponse.json({ error: "Group not found" }, { status: 404 });
	if (!canNest(tree, id, parsed.data.groupId)) {
		return NextResponse.json({ error: "That would put a group inside itself" }, { status: 400 });
	}
	await addSubgroup(db, id, parsed.data.groupId, access.user.id);
	await createAuditLog(access.env, { actorUserId: access.user.id, action: "group.subgroup_added", metadata: { groupId: id, subgroupId: parsed.data.groupId } });
	return NextResponse.json({ group: await getGroupDetail(db, id) });
}

export async function DELETE(request: Request, { params }: GroupSubgroupsRouteParams) {
	const access = await authorizeGroupAdmin(request, { manage: true });
	if (access.error) return access.error;
	const { id } = await params;
	const childId = new URL(request.url).searchParams.get("groupId");
	if (!childId) return NextResponse.json({ error: "Group is required" }, { status: 400 });
	const db = getDb(access.env);
	if (await removeSubgroup(db, id, childId)) {
		await createAuditLog(access.env, { actorUserId: access.user.id, action: "group.subgroup_removed", metadata: { groupId: id, subgroupId: childId } });
	}
	return NextResponse.json({ group: await getGroupDetail(db, id) });
}
