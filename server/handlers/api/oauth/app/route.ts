// Fork-only. The name of an app, for the page shown when a sign-in to it cannot go ahead.
import { NextResponse } from "#lib/http/next-compat";
import { getEnv } from "#lib/cloudflare";
import { requireSessionUser } from "#lib/api/auth";
import { findAppByClientId } from "#lib/oidc/apps";

export async function GET(request: Request) {
	const env = getEnv();
	const session = await requireSessionUser(env, request);
	if (session.error) return session.error;
	const app = await findAppByClientId(env, new URL(request.url).searchParams.get("client_id"));
	if (!app) return NextResponse.json({ error: "App not found" }, { status: 404 });
	return NextResponse.json({ name: app.name, homepageUrl: app.homepageUrl });
}
