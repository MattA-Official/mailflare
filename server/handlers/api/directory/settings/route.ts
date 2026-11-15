// Fork-only: directory settings. Everyone signed in can read them; user admins change them.
import { z } from "zod";
import { NextResponse } from "#lib/http/next-compat";
import { getDb } from "#db";
import { isDirectoryAdmin, NEEDS_MIGRATION, requireDirectoryReader } from "#lib/directory/api";
import { DirectoryNeedsMigrationError, isAssignableManager, loadDirectorySettings, saveDirectorySettings } from "#lib/directory/service";
import { createAuditLog } from "#lib/mailboxes/audit";

const settingsSchema = z.object({
	selfEditOrg: z.boolean().optional(),
	orgRootUserId: z.string().trim().max(200).nullable().optional(),
}).strict();

export async function GET(request: Request) {
	const access = await requireDirectoryReader(request);
	if (access.error) return access.error;
	const settings = await loadDirectorySettings(getDb(access.env));
	return NextResponse.json({ settings: { selfEditOrg: settings.selfEditOrg, orgRootUserId: settings.orgRootUserId }, available: settings.available, canManage: isDirectoryAdmin(access.user) });
}

export async function PATCH(request: Request) {
	const access = await requireDirectoryReader(request);
	if (access.error) return access.error;
	if (!isDirectoryAdmin(access.user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	const parsed = settingsSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ error: "Check the directory settings" }, { status: 400 });
	const db = getDb(access.env);
	if (parsed.data.orgRootUserId && !(await isAssignableManager(db, parsed.data.orgRootUserId))) {
		return NextResponse.json({ error: "Choose someone in the directory" }, { status: 400 });
	}
	try {
		await saveDirectorySettings(db, { selfEditOrg: parsed.data.selfEditOrg, orgRootUserId: parsed.data.orgRootUserId === undefined ? undefined : parsed.data.orgRootUserId || null });
	} catch (error) {
		if (error instanceof DirectoryNeedsMigrationError) return NextResponse.json(NEEDS_MIGRATION, { status: 503 });
		throw error;
	}
	await createAuditLog(access.env, { actorUserId: access.user.id, action: "directory.settings_updated", metadata: parsed.data });
	return NextResponse.json({ ok: true });
}
