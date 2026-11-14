// Fork-only. RFC 7009 token revocation for refresh tokens. Access tokens expire on their own.
import { getEnv } from "#lib/cloudflare";
import { authenticateClient, oauthError, oauthJson, readForm } from "#lib/oidc/http";
import { revokeRefreshToken } from "#lib/oidc/service";

export async function POST(request: Request) {
	const env = getEnv();
	const form = await readForm(request);
	if (!form) return oauthError("invalid_request", "Send an application/x-www-form-urlencoded body");
	const app = await authenticateClient(env, request, form);
	if (app instanceof Response) return app;
	const token = form.get("token");
	if (!token) return oauthError("invalid_request", "token is required");
	await revokeRefreshToken(env, app, token);
	return oauthJson({});
}

export const dynamic = "force-dynamic";
