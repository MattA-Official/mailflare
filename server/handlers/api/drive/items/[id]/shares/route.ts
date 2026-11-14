import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "#lib/http/next-compat";
import { driveGroupShares, driveShares, groupMembers, groups, users } from "#db/schema";
import { newId } from "#lib/ids";
import { authorizeDrive } from "#lib/drive/auth";
import { getDriveItem } from "#lib/drive/access";
import type { DriveItemParams } from "../types";

type Db = Parameters<typeof getDriveItem>[0];

async function loadOwnedItem(request: Request, params: DriveItemParams["params"], mutation: boolean) {
	const { id } = await params;
	const auth = await authorizeDrive(request, mutation);
	if (auth.error) return { error: auth.error } as const;
	const item = await getDriveItem(auth.db, id);
	if (!item || item.ownerId !== auth.user.id || item.trashedAt) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) } as const;
	return { ...auth, item } as const;
}

async function listShares(db: Db, itemId: string) {
	return db
		.select({ id: driveShares.id, userId: driveShares.userId, name: users.name, email: users.email, role: driveShares.role })
		.from(driveShares)
		.innerJoin(users, eq(driveShares.userId, users.id))
		.where(eq(driveShares.itemId, itemId))
		.orderBy(driveShares.createdAt);
}

/** Fork-only: the groups this item is shared with. */
async function listGroupShares(db: Db, itemId: string) {
	return db
		.select({ id: driveGroupShares.id, groupId: groups.id, name: groups.name, role: driveGroupShares.role })
		.from(driveGroupShares)
		.innerJoin(groups, eq(driveGroupShares.groupId, groups.id))
		.where(eq(driveGroupShares.itemId, itemId))
		.orderBy(asc(groups.name));
}

/** Fork-only: groups the owner may share with. Admins see every group; others only groups they belong to. */
async function listShareableGroups(db: Db, user: { id: string; role: string }) {
	if (user.role === "admin") return db.select({ id: groups.id, name: groups.name }).from(groups).orderBy(asc(groups.name));
	return db
		.select({ id: groups.id, name: groups.name })
		.from(groupMembers)
		.innerJoin(groups, eq(groupMembers.groupId, groups.id))
		.where(eq(groupMembers.userId, user.id))
		.orderBy(asc(groups.name));
}

async function shareState(db: Db, itemId: string) {
	return { shares: await listShares(db, itemId), groupShares: await listGroupShares(db, itemId) };
}

export async function GET(request: Request, { params }: DriveItemParams) {
	const ctx = await loadOwnedItem(request, params, false);
	if (ctx.error) return ctx.error;
	return NextResponse.json({
		...await shareState(ctx.db, ctx.item.id),
		availableGroups: await listShareableGroups(ctx.db, ctx.user),
		linkToken: ctx.item.linkToken,
	});
}

export async function POST(request: Request, { params }: DriveItemParams) {
	const ctx = await loadOwnedItem(request, params, true);
	if (ctx.error) return ctx.error;
	const { db, user, item } = ctx;
	const body = await request.json().catch(() => ({})) as { email?: unknown; groupId?: unknown; role?: unknown };
	const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
	const role = body.role === "edit" ? "edit" : "view";
	if (typeof body.groupId === "string" && body.groupId) {
		const groupId = body.groupId;
		const allowed = (await listShareableGroups(db, user)).some((group) => group.id === groupId);
		if (!allowed) return NextResponse.json({ error: "Group not found" }, { status: 404 });
		await db
			.insert(driveGroupShares)
			.values({ id: newId("dgsh"), itemId: item.id, groupId, role, createdByUserId: user.id })
			.onConflictDoUpdate({ target: [driveGroupShares.itemId, driveGroupShares.groupId], set: { role } });
		return NextResponse.json(await shareState(db, item.id));
	}
	if (!email) return NextResponse.json({ error: "Enter an email address" }, { status: 400 });
	const [target] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
	if (!target) return NextResponse.json({ error: "No account uses that email address" }, { status: 404 });
	if (target.id === user.id) return NextResponse.json({ error: "You already own this item" }, { status: 400 });
	await db.insert(driveShares).values({ id: newId("dshr"), itemId: item.id, userId: target.id, role }).onConflictDoUpdate({ target: [driveShares.itemId, driveShares.userId], set: { role } });
	return NextResponse.json(await shareState(db, item.id));
}

export async function DELETE(request: Request, { params }: DriveItemParams) {
	const ctx = await loadOwnedItem(request, params, true);
	if (ctx.error) return ctx.error;
	const url = new URL(request.url);
	const shareId = url.searchParams.get("shareId");
	const groupShareId = url.searchParams.get("groupShareId");
	if (groupShareId) {
		await ctx.db.delete(driveGroupShares).where(and(eq(driveGroupShares.id, groupShareId), eq(driveGroupShares.itemId, ctx.item.id)));
		return NextResponse.json(await shareState(ctx.db, ctx.item.id));
	}
	if (!shareId) return NextResponse.json({ error: "Missing share" }, { status: 400 });
	await ctx.db.delete(driveShares).where(and(eq(driveShares.id, shareId), eq(driveShares.itemId, ctx.item.id)));
	return NextResponse.json(await shareState(ctx.db, ctx.item.id));
}
