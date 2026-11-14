// Fork-only: shared drives (migration 0094). A shared drive is a Drive tree held by a hidden account of its own
// (users.kind = "drive"), the same pattern as shared inboxes (#lib/mailboxes/principals). Every drive_items row in
// the drive has that account as its owner, so uploads, folders, previews, public links and R2 keys work as they do
// for a person. Nobody owns the drive: people and groups reach it only through drive_members, at View, Edit or
// Manage, and admins who manage users can manage every drive. Deleting a person never touches a drive.
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { AppDatabase } from "#db";
import { driveMembers, groups, sharedDrives, users } from "#db/schema";
import { accountKinds } from "#lib/accounts/kind";
import { canManageUsers } from "#lib/auth/admin";
import { PASSWORDLESS_PASSWORD_HASH } from "#lib/auth/password";
import { effectiveGroupIds } from "#lib/groups/hierarchy";
import { newId } from "#lib/ids";
import { isMissingTableError } from "#lib/database-errors";
import type { DriveRole } from "./types";

export type DriveMemberRole = "view" | "edit" | "manage";
export const DRIVE_MEMBER_ROLES: DriveMemberRole[] = ["view", "edit", "manage"];
const RANK: Record<DriveMemberRole, number> = { view: 1, edit: 2, manage: 3 };
export const SHARED_DRIVE_MAX_NAME_LENGTH = 100;

export type SharedDriveActor = { id: string; role: string; isPrimaryAdmin?: boolean | null; canManageUsers?: boolean | null };

export type SharedDriveSummary = { id: string; name: string; role: DriveMemberRole; storageLimitBytes: number | null };

export function isDriveMemberRole(value: unknown): value is DriveMemberRole {
	return value === "view" || value === "edit" || value === "manage";
}

export function bestDriveMemberRole(roles: DriveMemberRole[]): DriveMemberRole | null {
	let best: DriveMemberRole | null = null;
	for (const role of roles) if (!best || RANK[role] > RANK[best]) best = role;
	return best;
}

/** Manage is reported to clients as "owner", so the role values the web and mobile apps already know keep their meaning. */
export function driveRoleForMember(role: DriveMemberRole): DriveRole {
	return role === "manage" ? "owner" : role;
}

/** Creating drives is for admins who manage users (Matt's decision, 2026-11-14). */
export function canCreateSharedDrives(actor: SharedDriveActor): boolean {
	return canManageUsers({ role: actor.role as "admin" | "user", isPrimaryAdmin: !!actor.isPrimaryAdmin, canManageUsers: !!actor.canManageUsers });
}

export function normalizeSharedDriveName(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const name = value.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, SHARED_DRIVE_MAX_NAME_LENGTH);
	return name || null;
}

/** A live (not deleted) shared drive, or null. Cheap enough to call for any Drive owner id. */
export async function getSharedDrive(db: AppDatabase, id: string): Promise<{ id: string; name: string; storageLimitBytes: number | null } | null> {
	const [row] = await withoutDriveTables([], () => db
		.select({ id: sharedDrives.id, name: users.name, storageLimitBytes: sharedDrives.storageLimitBytes })
		.from(sharedDrives)
		.innerJoin(users, eq(users.id, sharedDrives.id))
		.where(and(eq(sharedDrives.id, id), isNull(users.deletedAt)))
		.limit(1));
	return row ?? null;
}

/** Whether the id is a shared drive's account, deleted or not. */
export async function isSharedDriveId(db: AppDatabase, id: string): Promise<boolean> {
	const [row] = await withoutDriveTables([], () => db.select({ id: sharedDrives.id }).from(sharedDrives).where(eq(sharedDrives.id, id)).limit(1));
	return !!row;
}

async function loadActor(db: AppDatabase, userId: string): Promise<SharedDriveActor | null> {
	const [row] = await db
		.select({ id: users.id, role: users.role, isPrimaryAdmin: users.isPrimaryAdmin, canManageUsers: users.canManageUsers })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	return row ?? null;
}

/** The person's role on a live drive: their own membership, any group's (sub-groups included), or Manage as an admin. */
export async function getSharedDriveRole(db: AppDatabase, actor: SharedDriveActor | string, driveId: string): Promise<DriveMemberRole | null> {
	const person = typeof actor === "string" ? await loadActor(db, actor) : actor;
	if (!person) return null;
	if (!(await getSharedDrive(db, driveId))) return null;
	if (canCreateSharedDrives(person)) return "manage";
	const rows = await db
		.select({ role: driveMembers.role })
		.from(driveMembers)
		.where(and(eq(driveMembers.driveId, driveId), or(eq(driveMembers.userId, person.id), inArray(driveMembers.groupId, effectiveGroupIds(person.id)))));
	return bestDriveMemberRole(rows.map((row) => row.role));
}

/** Every live drive the person can reach, with their role, by name. Admins who manage users see every drive. */
export async function listSharedDrivesFor(db: AppDatabase, actor: SharedDriveActor): Promise<SharedDriveSummary[]> {
	const all = await withoutDriveTables([], () => db
		.select({ id: sharedDrives.id, name: users.name, storageLimitBytes: sharedDrives.storageLimitBytes })
		.from(sharedDrives)
		.innerJoin(users, eq(users.id, sharedDrives.id))
		.where(isNull(users.deletedAt))
		.orderBy(asc(sql`lower(${users.name})`)));
	if (canCreateSharedDrives(actor)) return all.map((drive) => ({ ...drive, role: "manage" as const }));
	if (!all.length) return [];
	const memberships = await db
		.select({ driveId: driveMembers.driveId, role: driveMembers.role })
		.from(driveMembers)
		.where(or(eq(driveMembers.userId, actor.id), inArray(driveMembers.groupId, effectiveGroupIds(actor.id))));
	const roles = new Map<string, DriveMemberRole[]>();
	for (const row of memberships) roles.set(row.driveId, [...(roles.get(row.driveId) ?? []), row.role]);
	return all.flatMap((drive) => {
		const role = bestDriveMemberRole(roles.get(drive.id) ?? []);
		return role ? [{ ...drive, role }] : [];
	});
}

/**
 * Runs a read of the shared drive tables. Until migration 0094 is applied they do not exist, and Drive must keep
 * working as if there were no shared drives, so a missing table gives `fallback`.
 */
export async function withoutDriveTables<T>(fallback: T, read: () => Promise<T>): Promise<T> {
	try {
		return await read();
	} catch (error) {
		if (isMissingTableError(error)) return fallback;
		throw error;
	}
}

export function sharedDriveEmail(id: string): string {
	return `${id}@drive.invalid`;
}

/** Creates a drive: its hidden account, its row and the creator as its first Manage member. */
export async function createSharedDrive(db: AppDatabase, input: { name: string; creatorId: string }): Promise<string> {
	const id = newId("drive");
	await db.insert(users).values({ id, email: sharedDriveEmail(id), passwordHash: PASSWORDLESS_PASSWORD_HASH, name: input.name, role: "user" });
	try {
		await db.update(accountKinds).set({ kind: "drive" }).where(eq(accountKinds.id, id));
		await db.insert(sharedDrives).values({ id, createdByUserId: input.creatorId });
		await db.insert(driveMembers).values({ id: newId("dmem"), driveId: id, userId: input.creatorId, role: "manage", createdByUserId: input.creatorId });
	} catch (error) {
		await db.delete(users).where(eq(users.id, id));
		throw error;
	}
	return id;
}

/**
 * Deletes a drive. Its account is disabled and marked deleted, so it vanishes at once and the scheduled account purge
 * removes its files and R2 objects after the restore window, exactly as it does for a person.
 */
export async function retireSharedDrive(db: AppDatabase, id: string): Promise<void> {
	if (!(await isSharedDriveId(db, id))) return;
	await db.update(users).set({ deletedAt: new Date(), disabled: true }).where(and(eq(users.id, id), sql`"users"."kind" = 'drive'`));
}

export type DriveMemberDto = { id: string; kind: "user" | "group"; memberId: string; name: string; email: string | null; role: DriveMemberRole };

export async function listDriveMembers(db: AppDatabase, driveId: string): Promise<DriveMemberDto[]> {
	const [people, teams] = await Promise.all([
		db
			.select({ id: driveMembers.id, memberId: users.id, name: users.name, email: users.email, role: driveMembers.role })
			.from(driveMembers)
			.innerJoin(users, eq(users.id, driveMembers.userId))
			.where(eq(driveMembers.driveId, driveId)),
		db
			.select({ id: driveMembers.id, memberId: groups.id, name: groups.name, role: driveMembers.role })
			.from(driveMembers)
			.innerJoin(groups, eq(groups.id, driveMembers.groupId))
			.where(eq(driveMembers.driveId, driveId)),
	]);
	const byName = (a: DriveMemberDto, b: DriveMemberDto) => a.name.localeCompare(b.name);
	return [
		...teams.map((row) => ({ ...row, kind: "group" as const, email: null })).sort(byName),
		...people.map((row) => ({ ...row, kind: "user" as const, name: row.name || row.email })).sort(byName),
	];
}

/** True when removing or downgrading this membership would leave the drive with no Manage member. */
export async function isLastManager(db: AppDatabase, driveId: string, membershipId: string): Promise<boolean> {
	const managers = await db
		.select({ id: driveMembers.id })
		.from(driveMembers)
		.where(and(eq(driveMembers.driveId, driveId), eq(driveMembers.role, "manage")));
	return managers.length === 1 && managers[0].id === membershipId;
}
