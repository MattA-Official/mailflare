import { eq, inArray } from "drizzle-orm";
import { NextResponse } from "#lib/http/next-compat";
import { driveItems } from "#db/schema";
import { authorizeDrive } from "#lib/drive/auth";
import { collectDriveDescendants, deleteDriveItems, getDriveChain, getDriveItem, getDriveRole } from "#lib/drive/access";
import { canEditDrive, driveObjectKey } from "#lib/drive/utils";
import { getDriveStorageLimitFor, getDriveStorageUsed } from "#lib/drive/storage";
import { driveRoleForMember, getSharedDriveRole, isSharedDriveId } from "#lib/drive/shared-drives";
import type { DriveRow } from "#lib/drive/types";

const MAX_BULK_ITEMS = 200;

/**
 * Applies one action to several items: trash, restore, move or delete (forever, trashed items only). Anyone who can edit
 * an item may move it to the trash; restoring and deleting forever are for the owner. Fork: editors move items within a
 * shared drive, and items move between My Drive and shared drives (see the move branch). Moving a trashed item
 * also takes it out of the trash, so it can be dragged from Trash straight into a folder.
 */
export async function POST(request: Request) {
	const auth = await authorizeDrive(request, true);
	if (auth.error) return auth.error;
	const { env, db, user } = auth;
	const body = await request.json().catch(() => ({})) as { action?: unknown; ids?: unknown; parentId?: unknown; driveId?: unknown };
	const ids = Array.isArray(body.ids) ? [...new Set(body.ids.filter((id): id is string => typeof id === "string"))] : [];
	if (!ids.length || ids.length > MAX_BULK_ITEMS) return NextResponse.json({ error: "Select between 1 and 200 items" }, { status: 400 });

	const owned: DriveRow[] = [];
	for (let index = 0; index < ids.length; index += 50) {
		owned.push(...await db.select().from(driveItems).where(inArray(driveItems.id, ids.slice(index, index + 50))));
	}
	if (owned.length !== ids.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
	for (const row of owned) {
		// Fork: "owner" is also a manager of the shared drive the item is in.
		const role = await getDriveRole(db, user.id, row, true);
		// Fork: editors may also move; where they may move to is checked below.
		const allowed = role === "owner" || ((body.action === "trash" || body.action === "move") && canEditDrive(role));
		if (!allowed) return NextResponse.json({ error: "Only the owner can change these items" }, { status: 403 });
	}
	const update = async (rows: DriveRow[], set: Partial<typeof driveItems.$inferInsert>) => {
		const targets = rows.map((row) => row.id);
		for (let index = 0; index < targets.length; index += 50) await db.update(driveItems).set({ ...set, updatedAt: new Date() }).where(inArray(driveItems.id, targets.slice(index, index + 50)));
		return targets.length;
	};

	if (body.action === "trash") return NextResponse.json({ count: await update(owned.filter((row) => !row.trashedAt), { trashedAt: new Date() }) });
	if (body.action === "restore") return NextResponse.json({ count: await update(owned.filter((row) => row.trashedAt), { trashedAt: null }) });
	if (body.action === "delete") {
		const trashed = owned.filter((row) => row.trashedAt);
		if (trashed.length) await deleteDriveItems(env, trashed);
		return NextResponse.json({ count: trashed.length });
	}
	if (body.action === "move") {
		// Fork: the destination is a folder, the top of a shared drive (`driveId`) or the top of My Drive. Items can
		// go into your own tree or a shared drive you can edit, never into another person's files.
		let parentId: string | null = null;
		let destinationOwnerId = user.id;
		if (typeof body.parentId === "string" && body.parentId) {
			const destination = await getDriveItem(db, body.parentId);
			if (!destination || destination.kind !== "folder" || destination.trashedAt || destination.uploadId || !canEditDrive(await getDriveRole(db, user.id, destination))) return NextResponse.json({ error: "Folder not found" }, { status: 404 });
			if (destination.ownerId !== user.id && !(await isSharedDriveId(db, destination.ownerId))) return NextResponse.json({ error: "Folder not found" }, { status: 404 });
			// A folder cannot move into itself or anything beneath it.
			const chain = new Set((await getDriveChain(db, destination)).map((row) => row.id));
			if (owned.some((row) => chain.has(row.id))) return NextResponse.json({ error: "Cannot move a folder into itself" }, { status: 400 });
			parentId = destination.id;
			destinationOwnerId = destination.ownerId;
		} else if (typeof body.driveId === "string" && body.driveId) {
			const role = await getSharedDriveRole(db, user, body.driveId);
			if (!role || !canEditDrive(driveRoleForMember(role))) return NextResponse.json({ error: "Drive not found" }, { status: 404 });
			destinationOwnerId = body.driveId;
		}
		// Within one tree, editing is enough. Taking items out of the tree they are in is for their owner, which for a
		// shared drive means its managers; the items then belong to the destination.
		const crossing: DriveRow[] = [];
		for (const row of owned) {
			if (row.ownerId === destinationOwnerId) continue;
			if ((await getDriveRole(db, user.id, row, true)) !== "owner") return NextResponse.json({ error: "Only the owner, or a shared drive's managers, can move items out of it" }, { status: 403 });
			crossing.push(row);
		}
		if (crossing.length) {
			const descendants = await collectDriveDescendants(db, crossing.filter((row) => row.kind === "folder").map((row) => row.id));
			const moving = [...crossing, ...descendants];
			const bytes = moving.reduce((total, row) => total + (row.kind === "file" ? row.size : 0), 0);
			const limit = await getDriveStorageLimitFor(env, db, destinationOwnerId);
			if (limit !== null && (await getDriveStorageUsed(db, destinationOwnerId)) + bytes > limit) return NextResponse.json({ error: "Not enough Drive storage left for these items" }, { status: 413 });
			// Stored objects are keyed by owner unless the row records its key, so pin the key before the owner changes.
			for (const row of moving) {
				if (row.kind === "file" && !row.r2Key) await db.update(driveItems).set({ r2Key: driveObjectKey(row.ownerId, row.id) }).where(eq(driveItems.id, row.id));
			}
			const ids = moving.map((row) => row.id);
			for (let index = 0; index < ids.length; index += 50) await db.update(driveItems).set({ ownerId: destinationOwnerId }).where(inArray(driveItems.id, ids.slice(index, index + 50)));
		}
		const crossingIds = new Set(crossing.map((row) => row.id));
		return NextResponse.json({ count: await update(owned.filter((row) => crossingIds.has(row.id) || row.parentId !== parentId || row.trashedAt), { parentId, trashedAt: null }) });
	}
	return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
