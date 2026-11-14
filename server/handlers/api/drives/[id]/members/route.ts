// Fork-only: who can use a shared drive. Members see the list; managers add, change and remove people and groups.
// A drive always keeps at least one Manage member, so it is never left with nobody to look after it.
import { and, asc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "#lib/http/next-compat";
import { driveMembers, groups, users } from "#db/schema";
import { authorizeDrive } from "#lib/drive/auth";
import { getSharedDrive, getSharedDriveRole, isDriveMemberRole, isLastManager, listDriveMembers } from "#lib/drive/shared-drives";
import { newId } from "#lib/ids";
import { createAuditLog } from "#lib/mailboxes/audit";
import { isPersonCondition } from "#lib/accounts/kind";
import type { SharedDriveParams } from "../types";

async function loadDrive(request: Request, params: SharedDriveParams["params"], mutation: boolean) {
	const { id } = await params;
	const auth = await authorizeDrive(request, mutation);
	if (auth.error) return { error: auth.error } as const;
	const drive = await getSharedDrive(auth.db, id);
	const role = drive ? await getSharedDriveRole(auth.db, auth.user, id) : null;
	if (!drive || !role) return { error: NextResponse.json({ error: "Drive not found" }, { status: 404 }) } as const;
	if (mutation && role !== "manage") return { error: NextResponse.json({ error: "Only the drive's managers can do that" }, { status: 403 }) } as const;
	return { ...auth, drive, role } as const;
}

type Db = ReturnType<typeof import("#db").getDb>;

async function memberState(db: Db, driveId: string, includeCandidates: boolean) {
	const members = await listDriveMembers(db, driveId);
	if (!includeCandidates) return { members };
	const [people, teams] = await Promise.all([
		db
			.select({ id: users.id, name: users.name, email: users.email })
			.from(users)
			.where(and(eq(users.disabled, false), isNull(users.deletedAt), isPersonCondition()))
			.orderBy(asc(users.name)),
		db.select({ id: groups.id, name: groups.name }).from(groups).orderBy(asc(groups.name)),
	]);
	const taken = new Set(members.map((member) => member.memberId));
	return {
		members,
		availableUsers: people.filter((person) => !taken.has(person.id)).map((person) => ({ ...person, name: person.name || person.email })),
		availableGroups: teams.filter((group) => !taken.has(group.id)),
	};
}

export async function GET(request: Request, { params }: SharedDriveParams) {
	const ctx = await loadDrive(request, params, false);
	if (ctx.error) return ctx.error;
	return NextResponse.json({ role: ctx.role, ...await memberState(ctx.db, ctx.drive.id, ctx.role === "manage") });
}

/** Adds a person or a group, or changes the role of one already there: `{ userId | groupId, role }`. */
export async function POST(request: Request, { params }: SharedDriveParams) {
	const ctx = await loadDrive(request, params, true);
	if (ctx.error) return ctx.error;
	const { env, db, user, drive } = ctx;
	const body = await request.json().catch(() => ({})) as { userId?: unknown; groupId?: unknown; role?: unknown };
	if (!isDriveMemberRole(body.role)) return NextResponse.json({ error: "Choose View, Edit or Manage" }, { status: 400 });
	const role = body.role;
	const userId = typeof body.userId === "string" && body.userId ? body.userId : null;
	const groupId = typeof body.groupId === "string" && body.groupId ? body.groupId : null;
	if (!userId === !groupId) return NextResponse.json({ error: "Choose a person or a group" }, { status: 400 });
	if (userId) {
		const [person] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, userId), eq(users.disabled, false), isNull(users.deletedAt), isPersonCondition())).limit(1);
		if (!person) return NextResponse.json({ error: "Account not found" }, { status: 404 });
	} else {
		const [group] = await db.select({ id: groups.id }).from(groups).where(eq(groups.id, groupId!)).limit(1);
		if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });
	}
	const [existing] = await db
		.select({ id: driveMembers.id, role: driveMembers.role })
		.from(driveMembers)
		.where(and(eq(driveMembers.driveId, drive.id), userId ? eq(driveMembers.userId, userId) : eq(driveMembers.groupId, groupId!)))
		.limit(1);
	if (existing) {
		if (existing.role === "manage" && role !== "manage" && await isLastManager(db, drive.id, existing.id)) {
			return NextResponse.json({ error: "A drive needs at least one manager" }, { status: 409 });
		}
		await db.update(driveMembers).set({ role }).where(eq(driveMembers.id, existing.id));
	} else {
		await db.insert(driveMembers).values({ id: newId("dmem"), driveId: drive.id, userId, groupId, role, createdByUserId: user.id });
	}
	await createAuditLog(env, { actorUserId: user.id, targetUserId: userId ?? drive.id, action: existing ? "drive.member_changed" : "drive.member_added", metadata: { driveId: drive.id, groupId, role } });
	return NextResponse.json(await memberState(db, drive.id, true));
}

/** Removes a membership: `?memberId=<membership id>`. */
export async function DELETE(request: Request, { params }: SharedDriveParams) {
	const ctx = await loadDrive(request, params, true);
	if (ctx.error) return ctx.error;
	const { env, db, user, drive } = ctx;
	const memberId = new URL(request.url).searchParams.get("memberId");
	if (!memberId) return NextResponse.json({ error: "Missing member" }, { status: 400 });
	const [existing] = await db.select().from(driveMembers).where(and(eq(driveMembers.id, memberId), eq(driveMembers.driveId, drive.id))).limit(1);
	if (!existing) return NextResponse.json({ error: "Member not found" }, { status: 404 });
	if (existing.role === "manage" && await isLastManager(db, drive.id, existing.id)) return NextResponse.json({ error: "A drive needs at least one manager" }, { status: 409 });
	await db.delete(driveMembers).where(eq(driveMembers.id, existing.id));
	await createAuditLog(env, { actorUserId: user.id, targetUserId: existing.userId ?? drive.id, action: "drive.member_removed", metadata: { driveId: drive.id, groupId: existing.groupId } });
	return NextResponse.json(await memberState(db, drive.id, true));
}
