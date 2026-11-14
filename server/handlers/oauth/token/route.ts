// Fork-only. OIDC token endpoint: authorization_code (with PKCE) and refresh_token grants.
import { getEnv } from "#lib/cloudflare";
import { authenticateClient, oauthError, oauthJson, readForm } from "#lib/oidc/http";
import { exchangeAuthorizationCode, getIssuer, refreshTokens } from "#lib/oidc/service";

export async function POST(request: Request) {
	const env = getEnv();
	const form = await readForm(request);
	if (!form) return oauthError("invalid_request", "Send an application/x-www-form-urlencoded body");
	const app = await authenticateClient(env, request, form);
	if (app instanceof Response) return app;
	const issuer = getIssuer(env, request);
	const grantType = form.get("grant_type");

	let result;
	if (grantType === "authorization_code") {
		const code = form.get("code");
		if (!code) return oauthError("invalid_request", "code is required");
		result = await exchangeAuthorizationCode(env, { issuer, app, code, redirectUri: form.get("redirect_uri"), codeVerifier: form.get("code_verifier") });
	} else if (grantType === "refresh_token") {
		const refreshToken = form.get("refresh_token");
		if (!refreshToken) return oauthError("invalid_request", "refresh_token is required");
		result = await refreshTokens(env, { issuer, app, refreshToken });
	} else {
		return oauthError("unsupported_grant_type", "Use authorization_code or refresh_token");
	}
	if ("error" in result) {
		// access_denied is not a token endpoint error code; invalid_grant tells the app to sign in again.
		return oauthError("invalid_grant", result.error === "access_denied" ? `Access ended: ${result.description}` : result.description);
	}
	return oauthJson(result);
}

export const dynamic = "force-dynamic";
