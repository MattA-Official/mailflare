import { NextResponse } from "#lib/http/next-compat";
import { getEnv } from "#lib/cloudflare";
import { requireSessionUser } from "#lib/api/auth";
import { getMfaStatus } from "#lib/auth/mfa";

export async function GET(request: Request) {
	const env = getEnv();
	const auth = await requireSessionUser(env, request);
	if (auth.error) return auth.error;
	return NextResponse.json(await getMfaStatus(env, auth.user));
}
