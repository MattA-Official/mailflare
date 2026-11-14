// Fork-only. HTTP helpers shared by the OAuth and OIDC endpoints.
import { findAppByClientId, verifyClientSecret, type OidcAppRow } from "./apps";

const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" };

export function oauthJson(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...NO_STORE, ...extra } });
}

export function oauthError(error: string, description: string, status = 400, extra: Record<string, string> = {}): Response {
	return oauthJson({ error, error_description: description }, status, extra);
}

/** Public metadata (discovery, keys) may be read from any origin. */
export function publicJson(body: unknown): Response {
	return new Response(JSON.stringify(body), {
		headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" },
	});
}

/** Reads an application/x-www-form-urlencoded body, as RFC 6749 requires for the token endpoint. */
export async function readForm(request: Request): Promise<URLSearchParams | null> {
	const type = request.headers.get("Content-Type") ?? "";
	if (!type.toLowerCase().startsWith("application/x-www-form-urlencoded")) return null;
	const text = await request.text();
	if (text.length > 16 * 1024) return null;
	return new URLSearchParams(text);
}

function decodeBasic(header: string | null): { clientId: string; secret: string } | null {
	if (!header?.startsWith("Basic ")) return null;
	try {
		const decoded = atob(header.slice(6).trim());
		const colon = decoded.indexOf(":");
		if (colon < 0) return null;
		// RFC 6749 §2.3.1: both parts are form-encoded before Basic encoding.
		return { clientId: decodeURIComponent(decoded.slice(0, colon).replace(/\+/g, " ")), secret: decodeURIComponent(decoded.slice(colon + 1).replace(/\+/g, " ")) };
	} catch {
		return null;
	}
}

/**
 * Authenticates the client on the token and revocation endpoints: client_secret_basic,
 * client_secret_post, or none for a public client (which then relies on PKCE alone).
 */
export async function authenticateClient(env: CloudflareEnv, request: Request, form: URLSearchParams): Promise<OidcAppRow | Response> {
	const basic = decodeBasic(request.headers.get("Authorization"));
	const clientId = basic?.clientId ?? form.get("client_id");
	const secret = basic?.secret ?? form.get("client_secret");
	if (basic && form.get("client_id") && form.get("client_id") !== basic.clientId) {
		return oauthError("invalid_request", "client_id does not match the Authorization header");
	}
	const app = await findAppByClientId(env, clientId);
	const unauthorized = oauthError("invalid_client", "Client authentication failed", 401, basic ? { "WWW-Authenticate": 'Basic realm="oauth"' } : {});
	if (!app || app.disabled) return unauthorized;
	if (!(await verifyClientSecret(app, secret))) return unauthorized;
	return app;
}
