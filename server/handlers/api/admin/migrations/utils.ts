import { NextResponse } from "#lib/http/next-compat";
import { assertPrimaryAdmin } from "#lib/auth/admin";
import { requireUser } from "#lib/auth/cookies";
import { getEnv } from "#lib/cloudflare";

// Upstream's admin update card also dispatched a GitHub workflow that merged upstream into the install's
// repository (/api/admin/update). That cannot work for this rewritten fork, so only the migrations half
// remains; the primary-admin check it shared lives here now.
export async function authorizeAdminRequest(request: Request) {
	const env = getEnv();
	let user: Awaited<ReturnType<typeof requireUser>>;
	try {
		user = await requireUser(env, request);
	} catch {
		return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
	}
	try {
		assertPrimaryAdmin(user);
	} catch {
		return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
	}
	return { env };
}

export async function authorizeMigrationRequest(request: Request) {
	const authorization = await authorizeAdminRequest(request);
	if ("error" in authorization) return authorization;
	if (request.method !== "GET" && request.headers.get("Origin") !== new URL(request.url).origin) {
		return { error: NextResponse.json({ error: "Invalid request origin" }, { status: 403 }) };
	}
	return authorization;
}
