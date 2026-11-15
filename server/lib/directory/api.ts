// Fork-only: request handling shared by the /api/directory routes.
import { z } from "zod";
import { NextResponse } from "#lib/http/next-compat";
import { getDb } from "#db";
import { getEnv } from "#lib/cloudflare";
import { requireSessionUser } from "#lib/api/auth";
import { canManageUsers } from "#lib/auth/admin";
import { createAuditLog } from "#lib/mailboxes/audit";
import type { SessionUser } from "#lib/auth/types";
import { DirectoryNeedsMigrationError, isAssignableManager, loadDirectory, loadProfiles, saveProfile, wouldLoop, type ProfileFields } from "./service";

export const NEEDS_MIGRATION = { error: "This needs the latest database update. Ask an administrator to apply it from Admin.", code: "needs_migration" } as const;

/** Every signed-in person may read the directory. */
export async function requireDirectoryReader(request: Request) {
	const env = getEnv();
	const session = await requireSessionUser(env, request);
	if (session.error) return { env, user: null, error: session.error } as const;
	return { env, user: session.user, error: null } as const;
}

export function isDirectoryAdmin(user: SessionUser): boolean {
	return canManageUsers(user);
}

const text = (max: number) => z.string().trim().max(max).nullable().optional().transform((value) => (value === undefined ? undefined : value || null));

export const profileInputSchema = z.object({
	title: text(120),
	department: text(120),
	phone: text(60),
	location: text(120),
	pronouns: text(40),
	about: text(1000),
	reportsToUserId: z.string().trim().max(200).nullable().optional().transform((value) => (value === undefined ? undefined : value || null)),
	hidden: z.boolean().optional(),
}).strict();

const ORG_FIELDS = ["title", "department", "reportsToUserId"] as const;

/**
 * Saves profile fields for `targetId`. The person themselves may change their own contact fields, and their title,
 * department and manager when the directory settings allow it; user admins may change anything, including hiding
 * the person. A manager must be an enabled person and must not make a loop.
 */
export async function updateProfileResponse(request: Request, actor: SessionUser, targetId: string): Promise<Response> {
	const env = getEnv();
	const db = getDb(env);
	const parsed = profileInputSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the profile fields" }, { status: 400 });
	const input = parsed.data;
	const admin = isDirectoryAdmin(actor);
	const self = actor.id === targetId;
	if (!admin && !self) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

	const snapshot = await loadDirectory(db);
	if (!snapshot.profilesAvailable) return NextResponse.json(NEEDS_MIGRATION, { status: 503 });
	if (!admin) {
		if (input.hidden !== undefined) return NextResponse.json({ error: "Only an administrator can hide someone from the directory" }, { status: 403 });
		if (!snapshot.settings.selfEditOrg && ORG_FIELDS.some((field) => input[field] !== undefined)) {
			return NextResponse.json({ error: "Only an administrator can change your title, department or manager" }, { status: 403 });
		}
	}
	if (!(await isAssignableManager(db, targetId))) return NextResponse.json({ error: "Person not found" }, { status: 404 });
	if (input.reportsToUserId) {
		if (!(await isAssignableManager(db, input.reportsToUserId))) return NextResponse.json({ error: "Choose someone in the directory as the manager" }, { status: 400 });
		const profiles = (await loadProfiles(db)) ?? new Map<string, ProfileFields>();
		if (wouldLoop(profiles, targetId, input.reportsToUserId)) {
			return NextResponse.json({ error: "That would make a loop: this person is already above their new manager", code: "reporting_loop" }, { status: 409 });
		}
	}
	try {
		await saveProfile(db, targetId, input);
	} catch (error) {
		if (error instanceof DirectoryNeedsMigrationError) return NextResponse.json(NEEDS_MIGRATION, { status: 503 });
		throw error;
	}
	if (!self || input.reportsToUserId !== undefined || input.hidden !== undefined) {
		await createAuditLog(env, { actorUserId: actor.id, targetUserId: targetId, action: "directory.profile_updated", metadata: { fields: Object.keys(input) } });
	}
	return NextResponse.json({ ok: true });
}
