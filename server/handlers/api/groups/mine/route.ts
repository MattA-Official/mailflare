// Fork-only. The groups the signed-in account belongs to, for Settings -> Groups. Open to every account.
import { NextResponse } from "#lib/http/next-compat";
import { getDb } from "#db";
import { getEnv } from "#lib/cloudflare";
import { requireSessionUser } from "#lib/api/auth";
import { listGroupsForMember } from "#lib/groups/service";

export async function GET(request: Request) {
	const env = getEnv();
	const session = await requireSessionUser(env, request);
	if (session.error) return session.error;
	return NextResponse.json({ groups: await listGroupsForMember(getDb(env), session.user.id) });
}
