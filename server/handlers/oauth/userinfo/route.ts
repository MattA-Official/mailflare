// Fork-only. OIDC UserInfo: who the access token belongs to and their current roles in the app.
import { eq } from "drizzle-orm";
import { getDb } from "#db";
import { users } from "#db/schema";
import { getEnv } from "#lib/cloudflare";
import { findAppByClientId, getAccountAppRoles } from "#lib/oidc/apps";
import { oauthJson } from "#lib/oidc/http";
import { getIssuer, verifyAccessToken } from "#lib/oidc/service";

const CORS = { "Access-Control-Allow-Origin": "*" };

function unauthorized(error = "invalid_token") {
	return oauthJson({ error }, 401, { ...CORS, "WWW-Authenticate": `Bearer error="${error}"` });
}

async function handle(request: Request) {
	const env = getEnv();
	const authorization = request.headers.get("Authorization");
	if (!authorization?.startsWith("Bearer ")) return unauthorized("invalid_request");
	const claims = await verifyAccessToken(env, getIssuer(env, request), authorization.slice(7).trim());
	if (!claims) return unauthorized();
	const app = await findAppByClientId(env, claims.client_id as string);
	if (!app || app.disabled) return unauthorized();
	const db = getDb({ DB: env.DB_PRIMARY ?? env.DB });
	const [user] = await db.select().from(users).where(eq(users.id, claims.sub as string)).limit(1);
	if (!user || user.disabled || user.deletedAt) return unauthorized();
	const scopes = new Set(String(claims.scope ?? "").split(" "));
	// Roles are read live, so this endpoint reflects a change before the token expires.
	const roles = await getAccountAppRoles(env, app, user.id);
	return oauthJson({
		sub: user.id,
		...(scopes.has("email") ? { email: user.email, email_verified: true } : {}),
		...(scopes.has("profile") ? { name: user.name } : {}),
		roles,
	}, 200, CORS);
}

export const GET = handle;
export const POST = handle;

export async function OPTIONS() {
	return new Response(null, { status: 204, headers: { ...CORS, "Access-Control-Allow-Headers": "Authorization", "Access-Control-Allow-Methods": "GET, POST" } });
}

export const dynamic = "force-dynamic";
