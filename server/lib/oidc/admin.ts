// Fork-only. Shared access check for the admin API of the OIDC provider: only the primary admin
// registers apps and hands out app roles, since app roles are staff access to other systems.
import { NextResponse } from "#lib/http/next-compat";
import { getEnv } from "#lib/cloudflare";
import { requireSessionUser } from "#lib/api/auth";
import { isPrimaryAdmin } from "#lib/auth/admin";
import { hasValidSessionMutationOrigin } from "#lib/auth/origin";

export async function authorizeAppAdmin(request: Request, options: { mutation?: boolean } = {}) {
	const env = getEnv();
	const session = await requireSessionUser(env, request);
	if (session.error) return { env, user: null, error: session.error } as const;
	if (!isPrimaryAdmin(session.user)) return { env, user: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) } as const;
	if (options.mutation && !hasValidSessionMutationOrigin(request)) {
		return { env, user: null, error: NextResponse.json({ error: "Invalid origin" }, { status: 403 }) } as const;
	}
	return { env, user: session.user, error: null } as const;
}
