// Fork-only: shared drives (migration 0094). Lists the drives the person can reach and creates new ones.
import { NextResponse } from "#lib/http/next-compat";
import { authorizeDrive } from "#lib/drive/auth";
import { getDriveStorageUsed } from "#lib/drive/storage";
import { canCreateSharedDrives, createSharedDrive, listSharedDrivesFor, normalizeSharedDriveName } from "#lib/drive/shared-drives";
import { createAuditLog } from "#lib/mailboxes/audit";
import { isMissingTableError } from "#lib/database-errors";

export async function GET(request: Request) {
	const auth = await authorizeDrive(request);
	if (auth.error) return auth.error;
	const drives = await listSharedDrivesFor(auth.db, auth.user);
	return NextResponse.json({ drives, canCreate: canCreateSharedDrives(auth.user) });
}

/** Creates a drive. Admins who manage users only; the creator becomes its first Manage member. */
export async function POST(request: Request) {
	const auth = await authorizeDrive(request, true);
	if (auth.error) return auth.error;
	const { env, db, user } = auth;
	if (!canCreateSharedDrives(user)) return NextResponse.json({ error: "Only admins can create shared drives" }, { status: 403 });
	const body = await request.json().catch(() => ({})) as { name?: unknown };
	const name = normalizeSharedDriveName(body.name);
	if (!name) return NextResponse.json({ error: "Enter a name for the drive" }, { status: 400 });
	let id: string;
	try {
		id = await createSharedDrive(db, { name, creatorId: user.id });
	} catch (error) {
		// Shared drives need migration 0094; until it is applied, say so rather than fail.
		if (isMissingTableError(error)) return NextResponse.json({ error: "Apply the latest database update from the admin update card first" }, { status: 409 });
		throw error;
	}
	await createAuditLog(env, { actorUserId: user.id, targetUserId: id, action: "drive.created", metadata: { name } });
	return NextResponse.json({ drive: { id, name, role: "manage", storageLimitBytes: null, storageUsed: await getDriveStorageUsed(db, id) } }, { status: 201 });
}
