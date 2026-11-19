import { and, desc, eq, isNotNull, isNull, or } from "drizzle-orm";
import { NextResponse } from "#lib/http/next-compat";
import { driveItems } from "#db/schema";
import { newId } from "#lib/ids";
import { authorizeDrive } from "#lib/drive/auth";
import { getDriveChain, getDriveItem, getDriveRole, isDriveItemSharedWith, listDriveItemsSharedWith, toDriveItemDtos, withoutTrashedAncestors } from "#lib/drive/access";
import { canEditDrive, normalizeDriveName, toDriveCrumbs } from "#lib/drive/utils";
import { driveTypesCondition, parseDriveCategories } from "#lib/drive/categories";
import { listDriveAttachments } from "#lib/drive/attachments";
import { getDriveStorageLimitFor, getDriveStorageUsed } from "#lib/drive/storage";
import { driveRoleForMember, getSharedDrive, getSharedDriveRole, type DriveMemberRole, type SharedDriveActor } from "#lib/drive/shared-drives";
import type { DriveRole } from "#lib/drive/types";
import { containsLike } from "#db/sql";

export async function GET(request: Request) {
	const auth = await authorizeDrive(request);
	if (auth.error) return auth.error;
	const { env, db, user } = auth;
	const url = new URL(request.url);
	const view = url.searchParams.get("view") ?? "my";
	const parentId = url.searchParams.get("parent");
	const query = url.searchParams.get("q")?.trim();
	const types = parseDriveCategories(url.searchParams.get("types"));
	// With a type filter, files must match but folders stay listed so you can still browse into them.
	const typeFilter = types.length ? or(eq(driveItems.kind, "folder"), driveTypesCondition(types))! : undefined;

	const storageFor = async (ownerId: string) => ({ storageUsed: await getDriveStorageUsed(db, ownerId), storageLimit: await getDriveStorageLimitFor(env, db, ownerId) });
	// Fork: `drive` is set (additive) while browsing a shared drive, and storage then shows the drive's own.
	const respond = async (items: Awaited<ReturnType<typeof toDriveItemDtos>>, extra: { path?: ReturnType<typeof toDriveCrumbs>; role: DriveRole; drive?: SharedDriveContext | null }) =>
		NextResponse.json({ items, path: extra.path ?? [], role: extra.role, ...(extra.drive ? { drive: extra.drive } : {}), ...await storageFor(extra.drive?.id ?? user.id) });

	if (parentId) {
		const folder = await getDriveItem(db, parentId);
		const role = folder?.kind === "folder" ? await getDriveRole(db, user.id, folder) : null;
		if (!folder || !role) return NextResponse.json({ error: "Folder not found" }, { status: 404 });
		const rows = await db.select().from(driveItems).where(and(eq(driveItems.parentId, folder.id), isNull(driveItems.trashedAt), isNull(driveItems.uploadId), typeFilter));
		const chain = await getDriveChain(db, folder);
		const drive = await sharedDriveContext(db, user, folder.ownerId);
		// For shared folders the breadcrumb starts at the folder the user was given access to; a drive's members see it all.
		const visibleChain = role === "owner" || drive ? chain : await trimToSharedRoot(db, user.id, chain);
		return respond(await toDriveItemDtos(db, rows, user.id, () => role), { path: toDriveCrumbs(visibleChain), role, drive });
	}

	// Fork: the top level, search and trash of a shared drive.
	const driveId = url.searchParams.get("drive");
	if (driveId) {
		const drive = await sharedDriveContext(db, user, driveId);
		if (!drive) return NextResponse.json({ error: "Drive not found" }, { status: 404 });
		const role = driveRoleForMember(drive.role);
		if (view === "trash") {
			if (!canEditDrive(role)) return NextResponse.json({ error: "Drive not found" }, { status: 404 });
			const rows = await db.select().from(driveItems).where(and(eq(driveItems.ownerId, drive.id), isNotNull(driveItems.trashedAt), typeFilter)).orderBy(desc(driveItems.trashedAt));
			return respond(await toDriveItemDtos(db, rows, user.id, () => role), { role, drive });
		}
		return respond(await toDriveItemDtos(db, await listTree(drive.id), user.id, () => role), { role, drive });
	}

	if (view === "attachments") return respond(await listDriveAttachments(db, user, types), { role: "view" });

	if (view === "shared") {
		// Fork: includes items shared with a group the user belongs to.
		const rows = await listDriveItemsSharedWith(db, user.id, and(isNull(driveItems.trashedAt), isNull(driveItems.uploadId), typeFilter));
		const roles = new Map(rows.map((row) => [row.item.id, row.role as DriveRole]));
		return respond(await toDriveItemDtos(db, rows.map((row) => row.item), user.id, (row) => roles.get(row.id) ?? "view"), { role: "view" });
	}

	if (view === "trash") {
		const rows = await db.select().from(driveItems).where(and(eq(driveItems.ownerId, user.id), isNotNull(driveItems.trashedAt), typeFilter)).orderBy(desc(driveItems.trashedAt));
		const trashedAttachments = await listDriveAttachments(db, user, types, true);
		const merged = [...await toDriveItemDtos(db, rows, user.id), ...trashedAttachments].sort((a, b) => (b.trashedAt ?? "").localeCompare(a.trashedAt ?? ""));
		return respond(merged, { role: "owner" });
	}

	return respond(await toDriveItemDtos(db, await listTree(user.id), user.id), { role: "owner" });

	/** My Drive, or a shared drive's top level. A type filter, like a search, looks through every folder instead of only the top level. */
	async function listTree(ownerId: string) {
		if (types.length && !query) {
			const rows = await db.select().from(driveItems).where(and(eq(driveItems.ownerId, ownerId), eq(driveItems.kind, "file"), isNull(driveItems.trashedAt), isNull(driveItems.uploadId), driveTypesCondition(types))).orderBy(desc(driveItems.updatedAt)).limit(1000);
			return withoutTrashedAncestors(db, rows);
		}
		const conditions = [eq(driveItems.ownerId, ownerId), isNull(driveItems.trashedAt), isNull(driveItems.uploadId)];
		if (query) conditions.push(containsLike(driveItems.name, query));
		else conditions.push(isNull(driveItems.parentId));
		if (typeFilter) conditions.push(typeFilter);
		return db.select().from(driveItems).where(and(...conditions)).orderBy(desc(driveItems.updatedAt)).limit(query ? 200 : 1000);
	}
}

type SharedDriveContext = { id: string; name: string; role: DriveMemberRole };

/** Fork-only. The shared drive that owns these items, when the person is one of its members (or an admin). */
async function sharedDriveContext(db: Parameters<typeof getDriveRole>[0], user: SharedDriveActor, ownerId: string): Promise<SharedDriveContext | null> {
	const drive = await getSharedDrive(db, ownerId);
	if (!drive) return null;
	const role = await getSharedDriveRole(db, user, ownerId);
	return role ? { id: drive.id, name: drive.name, role } : null;
}

async function trimToSharedRoot(db: Parameters<typeof getDriveRole>[0], userId: string, chain: Awaited<ReturnType<typeof getDriveChain>>) {
	for (let index = 0; index < chain.length; index += 1) {
		if (await isDriveItemSharedWith(db, chain[index].id, userId)) return chain.slice(index);
	}
	return chain;
}

/** Creates a folder. */
export async function POST(request: Request) {
	const auth = await authorizeDrive(request, true);
	if (auth.error) return auth.error;
	const { db, user } = auth;
	const body = await request.json().catch(() => ({})) as { name?: unknown; parentId?: unknown; driveId?: unknown };
	const name = normalizeDriveName(body.name);
	if (!name) return NextResponse.json({ error: "Enter a folder name" }, { status: 400 });
	let ownerId = user.id;
	let parentId: string | null = null;
	if (typeof body.parentId === "string" && body.parentId) {
		const parent = await getDriveItem(db, body.parentId);
		const role = parent?.kind === "folder" ? await getDriveRole(db, user.id, parent) : null;
		if (!parent || !canEditDrive(role)) return NextResponse.json({ error: "Folder not found" }, { status: 404 });
		parentId = parent.id;
		ownerId = parent.ownerId;
	} else if (typeof body.driveId === "string" && body.driveId) {
		// Fork: a folder at the top level of a shared drive.
		const role = await getSharedDriveRole(db, user, body.driveId);
		if (!role || !canEditDrive(driveRoleForMember(role))) return NextResponse.json({ error: "Drive not found" }, { status: 404 });
		ownerId = body.driveId;
	}
	const now = new Date();
	const row = { id: newId("drv"), ownerId, parentId, kind: "folder" as const, name, r2Key: null, size: 0, contentType: "application/x-directory", uploadId: null, uploadPartSize: null, uploadFingerprint: null, linkToken: null, trashedAt: null, createdAt: now, updatedAt: now };
	await db.insert(driveItems).values(row);
	const role = ownerId === user.id ? "owner" : await getDriveRole(db, user.id, row) ?? "edit";
	const [item] = await toDriveItemDtos(db, [row], user.id, () => role);
	return NextResponse.json({ item });
}
