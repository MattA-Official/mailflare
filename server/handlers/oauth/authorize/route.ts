// Fork-only. OIDC authorization endpoint: code flow with PKCE (S256) only.
import { getEnv } from "#lib/cloudflare";
import { getSessionFromToken, getSessionTokenFromRequestHeaders } from "#lib/auth/session";
import { findAppByClientId, parseRedirectUris } from "#lib/oidc/apps";
import { checkAccess, createAuthorizationCode, getIssuer, normalizeScope } from "#lib/oidc/service";

function redirect(location: string): Response {
	return new Response(null, { status: 302, headers: { Location: location, "Cache-Control": "no-store" } });
}

/** Errors that cannot go back to the app (unknown app or redirect URI) are shown on Mailflare's own page. */
function showError(reason: string, clientId?: string | null): Response {
	const params = new URLSearchParams({ reason });
	if (clientId) params.set("client_id", clientId);
	return redirect(`/oauth/blocked?${params}`);
}

export async function GET(request: Request) {
	const env = getEnv();
	const url = new URL(request.url);
	const query = url.searchParams;
	const issuer = getIssuer(env, request);
	const clientId = query.get("client_id");

	const app = await findAppByClientId(env, clientId);
	if (!app) return showError("unknown_app");
	const redirectUri = query.get("redirect_uri");
	if (!redirectUri || !parseRedirectUris(app).includes(redirectUri)) return showError("bad_redirect", clientId);

	// From here on, errors go back to the app (RFC 6749 §4.1.2.1), with the issuer (RFC 9207).
	const state = query.get("state");
	const back = (params: Record<string, string>) => {
		const target = new URL(redirectUri);
		for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
		if (state !== null) target.searchParams.set("state", state);
		target.searchParams.set("iss", issuer);
		return redirect(target.toString());
	};
	const fail = (error: string, description: string) => back({ error, error_description: description });

	if (app.disabled) return fail("access_denied", "This app is switched off in Mailflare");
	if (query.get("request") || query.get("request_uri")) return fail("request_not_supported", "Request objects are not supported");
	if (query.get("response_type") !== "code") return fail("unsupported_response_type", "Only response_type=code is supported");
	const scope = normalizeScope(query.get("scope"));
	if (!scope) return fail("invalid_scope", "scope must include openid");
	const codeChallenge = query.get("code_challenge");
	if (!codeChallenge || !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge) || query.get("code_challenge_method") !== "S256") {
		return fail("invalid_request", "PKCE with code_challenge_method=S256 is required");
	}
	const nonce = query.get("nonce");
	if (nonce && nonce.length > 255) return fail("invalid_request", "nonce is too long");
	const prompts = new Set((query.get("prompt") ?? "").split(" ").filter(Boolean));
	if (prompts.has("none") && prompts.size > 1) return fail("invalid_request", "prompt=none cannot be combined");
	const maxAgeValue = query.get("max_age");
	const maxAge = maxAgeValue === null ? null : Number(maxAgeValue);
	if (maxAge !== null && (!Number.isInteger(maxAge) || maxAge < 0)) return fail("invalid_request", "max_age must be a whole number of seconds");

	// After signing in, the browser comes back here without prompt=login, so it does not loop.
	const retryQuery = new URLSearchParams(query);
	retryQuery.delete("prompt");
	const retry = `/oauth/authorize?${retryQuery}`;
	const signIn = (again: boolean) => redirect(`/login?${new URLSearchParams({ ...(again ? { add: "1" } : {}), next: retry })}`);

	const session = await getSessionFromToken(env, getSessionTokenFromRequestHeaders(request));
	if (!session) {
		return prompts.has("none") ? fail("login_required", "Not signed in to Mailflare") : signIn(false);
	}
	const ageSeconds = (Date.now() - session.createdAt.getTime()) / 1000;
	if (prompts.has("login") || (maxAge !== null && ageSeconds > maxAge)) {
		return prompts.has("none") ? fail("login_required", "A fresh sign-in is required") : signIn(true);
	}

	const access = await checkAccess(env, app, session.userId, session.id);
	if (!access.ok) {
		if (access.reason === "login_required" || access.reason === "account_disabled") {
			return prompts.has("none") ? fail("login_required", "Not signed in to Mailflare") : signIn(false);
		}
		if (prompts.has("none")) {
			return access.reason === "two_factor_required"
				? fail("interaction_required", "Sign in to Mailflare with two-step verification")
				: fail("access_denied", "This account has no role in this app");
		}
		const params = new URLSearchParams({ reason: access.reason, client_id: app.clientId, retry });
		return redirect(`/oauth/blocked?${params}`);
	}

	const code = await createAuthorizationCode(env, {
		app,
		userId: session.userId,
		session: access.session,
		redirectUri,
		codeChallenge,
		scope,
		nonce,
	});
	return back({ code });
}

export const dynamic = "force-dynamic";
