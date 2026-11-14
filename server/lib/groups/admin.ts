// Fork-only. Access check for the groups API: any admin may list and read groups (to share inboxes with
// them); creating, editing and deleting groups and changing members needs account management.
import { NextResponse } from "#lib/http/next-compat";
import { getEnv } from "#lib/cloudflare";
import { requireSessionUser } from "#lib/api/auth";
import { hasValidSessionMutationOrigin } from "#lib/auth/origin";
import { canManageGroups, canViewGroups } from "./permissions";

export async function authorizeGroupAdmin(request: Request, options: { manage?: boolean } = {}) {
	const env = getEnv();
	const session = await requireSessionUser(env, request);
	if (session.error) return { env, user: null, error: session.error } as const;
	const allowed = options.manage ? canManageGroups(session.user) : canViewGroups(session.user);
	if (!allowed) return { env, user: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) } as const;
	if (options.manage && !hasValidSessionMutationOrigin(request)) {
		return { env, user: null, error: NextResponse.json({ error: "Invalid origin" }, { status: 403 }) } as const;
	}
	return { env, user: session.user, error: null } as const;
}
