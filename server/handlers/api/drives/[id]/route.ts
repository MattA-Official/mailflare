// Fork-only: one shared drive. Members read it; managers rename or delete it; only admins set its storage cap.
import { eq } from "drizzle-orm";
import { NextResponse } from "#lib/http/next-compat";
import { sharedDrives, users } from "#db/schema";
import { authorizeDrive } from "#lib/drive/auth";
import { getDriveStorageUsed } from "#lib/drive/storage";
import { canCreateSharedDrives, getSharedDrive, getSharedDriveRole, normalizeSharedDriveName, retireSharedDrive } from "#lib/drive/shared-drives";
import { createAuditLog } from "#lib/mailboxes/audit";
import type { SharedDriveParams } from "./types";

async function loadDrive(request: Request, params: SharedDriveParams["params"], mutation: boolean) {
	const { id } = await params;
	const auth = await authorizeDrive(request, mutation);
	if (auth.error) return { error: auth.error } as const;
	const drive = await getSharedDrive(auth.db, id);
	const role = drive ? await getSharedDriveRole(auth.db, auth.user, id) : null;
	if (!drive || !role) return { error: NextResponse.json({ error: "Drive not found" }, { status: 404 }) } as const;
	return { ...auth, drive, role } as const;
}

export async function GET(request: Request, { params }: SharedDriveParams) {
	const ctx = await loadDrive(request, params, false);
	if (ctx.error) return ctx.error;
	const { db, user, drive, role } = ctx;
	return NextResponse.json({ drive: { ...drive, role, storageUsed: await getDriveStorageUsed(db, drive.id), canSetLimit: canCreateSharedDrives(user) } });
}

/** Renames the drive (Manage), or sets its cap in bytes (admins; null or 0 is unlimited). */
export async function PATCH(request: Request, { params }: SharedDriveParams) {
	const ctx = await loadDrive(request, params, true);
	if (ctx.error) return ctx.error;
	const { env, db, user, drive, role } = ctx;
	if (role !== "manage") return NextResponse.json({ error: "Only the drive's managers can do that" }, { status: 403 });
	const body = await request.json().catch(() => ({})) as { name?: unknown; storageLimitBytes?: unknown };
	if (body.name !== undefined) {
		const name = normalizeSharedDriveName(body.name);
		if (!name) return NextResponse.json({ error: "Enter a name for the drive" }, { status: 400 });
		await db.update(users).set({ name }).where(eq(users.id, drive.id));
		await createAuditLog(env, { actorUserId: user.id, targetUserId: drive.id, action: "drive.renamed", metadata: { from: drive.name, to: name } });
	}
	if (body.storageLimitBytes !== undefined) {
		if (!canCreateSharedDrives(user)) return NextResponse.json({ error: "Only admins can change a drive's storage limit" }, { status: 403 });
		const limit = body.storageLimitBytes;
		if (limit !== null && !(typeof limit === "number" && Number.isSafeInteger(limit) && limit >= 0)) return NextResponse.json({ error: "Enter a valid storage limit" }, { status: 400 });
		await db.update(sharedDrives).set({ storageLimitBytes: limit || null }).where(eq(sharedDrives.id, drive.id));
		await createAuditLog(env, { actorUserId: user.id, targetUserId: drive.id, action: "drive.storage_limit_changed", metadata: { storageLimitBytes: limit || null } });
	}
	const updated = await getSharedDrive(db, drive.id);
	return NextResponse.json({ drive: { ...updated, role, storageUsed: await getDriveStorageUsed(db, drive.id), canSetLimit: canCreateSharedDrives(user) } });
}

/** Deletes the drive for everyone. Its files are removed for good by the account purge after the restore window. */
export async function DELETE(request: Request, { params }: SharedDriveParams) {
	const ctx = await loadDrive(request, params, true);
	if (ctx.error) return ctx.error;
	const { env, db, user, drive, role } = ctx;
	if (role !== "manage") return NextResponse.json({ error: "Only the drive's managers can do that" }, { status: 403 });
	await retireSharedDrive(db, drive.id);
	await createAuditLog(env, { actorUserId: user.id, targetUserId: drive.id, action: "drive.deleted", metadata: { name: drive.name } });
	return NextResponse.json({ ok: true });
}
