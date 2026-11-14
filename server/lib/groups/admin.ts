// Fork-only. Access checks for the groups API. Any admin may list and read groups (to share inboxes with
// them); creating, editing and deleting groups and choosing managers needs account management. A
// group's managers may add and remove its ordinary members, and its members may read it.
import { and, eq } from "drizzle-orm";
import { NextResponse } from "#lib/http/next-compat";
import { getDb } from "#db";
import { groupMembers } from "#db/schema";
import { getEnv } from "#lib/cloudflare";
import { requireSessionUser } from "#lib/api/auth";
import { hasValidSessionMutationOrigin } from "#lib/auth/origin";
import { canManageGroups, canViewGroups } from "./permissions";

const forbidden = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });

export async function authorizeGroupAdmin(request: Request, options: { manage?: boolean } = {}) {
	const env = getEnv();
	const session = await requireSessionUser(env, request);
	if (session.error) return { env, user: null, error: session.error } as const;
	const allowed = options.manage ? canManageGroups(session.user) : canViewGroups(session.user);
	if (!allowed) return { env, user: null, error: forbidden() } as const;
	if (options.manage && !hasValidSessionMutationOrigin(request)) {
		return { env, user: null, error: NextResponse.json({ error: "Invalid origin" }, { status: 403 }) } as const;
	}
	return { env, user: session.user, error: null } as const;
}

/**
 * Access to one group. `read` is open to admins and the group's members; `members` (adding and removing
 * ordinary members) to account managers and the group's managers. `canManage` says whether the caller may
 * also rename or delete the group and choose its managers.
 */
export async function authorizeGroupAccess(request: Request, groupId: string, need: "read" | "members") {
	const env = getEnv();
	const session = await requireSessionUser(env, request);
	if (session.error) return { env, user: null, error: session.error } as const;
	const user = session.user;
	const [membership] = await getDb(env)
		.select({ role: groupMembers.role })
		.from(groupMembers)
		.where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, user.id)))
		.limit(1);
	const myRole = membership?.role ?? null;
	const canManage = canManageGroups(user);
	const canManageMembers = canManage || myRole === "manager";
	const allowed = need === "read" ? canViewGroups(user) || !!membership : canManageMembers;
	if (!allowed) return { env, user: null, error: forbidden() } as const;
	if (need === "members" && request.method !== "GET" && !hasValidSessionMutationOrigin(request)) {
		return { env, user: null, error: NextResponse.json({ error: "Invalid origin" }, { status: 403 }) } as const;
	}
	return { env, user, error: null, myRole, canManage, canManageMembers } as const;
}
