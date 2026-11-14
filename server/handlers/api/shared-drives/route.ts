// Fork-only: every shared drive on the instance, for admins who manage users, including ones deleted but still
// restorable. Drives hold themselves (#lib/drive/shared-drives), so this is where admins see them all at once.
import { count, eq, inArray, sql } from "drizzle-orm";
import { NextResponse } from "#lib/http/next-compat";
import { driveItems, driveMembers, sharedDrives, users } from "#db/schema";
import { getAccountPurgeDate } from "#lib/accounts/deletion-utils";
import { authorizeDrive } from "#lib/drive/auth";
import { canCreateSharedDrives, withoutDriveTables } from "#lib/drive/shared-drives";

export async function GET(request: Request) {
	const auth = await authorizeDrive(request);
	if (auth.error) return auth.error;
	const { db, user } = auth;
	if (!canCreateSharedDrives(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	const rows = await withoutDriveTables([], () => db
		.select({ id: sharedDrives.id, name: users.name, storageLimitBytes: sharedDrives.storageLimitBytes, createdAt: sharedDrives.createdAt, deletedAt: users.deletedAt })
		.from(sharedDrives)
		.innerJoin(users, eq(users.id, sharedDrives.id))
		.orderBy(sql`lower(${users.name})`));
	const ids = rows.map((row) => row.id);
	const [members, sizes] = ids.length
		? await Promise.all([
			db
				.select({ driveId: driveMembers.driveId, people: sql<number>`count(${driveMembers.userId})`, groups: sql<number>`count(${driveMembers.groupId})`, managers: sql<number>`sum(case when ${driveMembers.role} = 'manage' then 1 else 0 end)` })
				.from(driveMembers)
				.where(inArray(driveMembers.driveId, ids))
				.groupBy(driveMembers.driveId),
			db
				.select({ ownerId: driveItems.ownerId, bytes: sql<number>`coalesce(sum(${driveItems.size}), 0)`, files: count() })
				.from(driveItems)
				.where(inArray(driveItems.ownerId, ids))
				.groupBy(driveItems.ownerId),
		])
		: [[], []];
	const membersBy = new Map(members.map((row) => [row.driveId, row]));
	const sizesBy = new Map(sizes.map((row) => [row.ownerId, row]));
	return NextResponse.json({
		drives: rows.map((row) => ({
			id: row.id,
			name: row.name,
			createdAt: row.createdAt,
			deleted: !!row.deletedAt,
			purgeAt: row.deletedAt ? getAccountPurgeDate(row.deletedAt) : null,
			storageLimitBytes: row.storageLimitBytes,
			storageUsed: Number(sizesBy.get(row.id)?.bytes ?? 0),
			peopleCount: Number(membersBy.get(row.id)?.people ?? 0),
			groupCount: Number(membersBy.get(row.id)?.groups ?? 0),
			managerCount: Number(membersBy.get(row.id)?.managers ?? 0),
		})),
	});
}

