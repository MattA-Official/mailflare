// Fork-only. Lists and creates groups of accounts.
import { NextResponse } from "#lib/http/next-compat";
import { getDb } from "#db";
import { groups } from "#db/schema";
import { isUniqueConstraintError } from "#lib/database-errors";
import { authorizeGroupAdmin } from "#lib/groups/admin";
import { canManageGroups } from "#lib/groups/permissions";
import { listGroups } from "#lib/groups/service";
import { newId } from "#lib/ids";
import { createAuditLog } from "#lib/mailboxes/audit";
import { groupSchema } from "#lib/validators";

export async function GET(request: Request) {
	const access = await authorizeGroupAdmin(request);
	if (access.error) return access.error;
	return NextResponse.json({ groups: await listGroups(getDb(access.env)), canManage: canManageGroups(access.user) });
}

export async function POST(request: Request) {
	const access = await authorizeGroupAdmin(request, { manage: true });
	if (access.error) return access.error;
	const parsed = groupSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ error: "Enter a group name" }, { status: 400 });
	const id = newId("grp");
	try {
		await getDb(access.env).insert(groups).values({
			id,
			name: parsed.data.name,
			description: parsed.data.description || null,
			createdByUserId: access.user.id,
		});
	} catch (error) {
		if (isUniqueConstraintError(error)) return NextResponse.json({ error: "A group with that name already exists" }, { status: 409 });
		throw error;
	}
	await createAuditLog(access.env, { actorUserId: access.user.id, action: "group.created", metadata: { groupId: id, name: parsed.data.name } });
	return NextResponse.json({ group: { id, name: parsed.data.name } }, { status: 201 });
}
