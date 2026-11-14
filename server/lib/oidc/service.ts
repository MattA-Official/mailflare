// Fork-only. The OpenID Connect provider: authorization codes with PKCE, tokens, refresh and access checks.
//
// Staff apps sign people in here. Access needs three things, checked when a code is issued, when it
// is exchanged and on every refresh: an enabled account, a Mailflare session that was signed in with
// two factors (a passkey, or a password and a code), and at least one role in the app.
import { and, eq, gt, isNull, lt, or } from "drizzle-orm";
import { getDb } from "#db";
import { oidcAuthorizationCodes, oidcRefreshTokens, sessions, users } from "#db/schema";
import { isTwoFactorAmr } from "#lib/auth/session";
import { newId } from "#lib/ids";
import { getAccountAppRoles, type OidcAppRow } from "./apps";
import { getSigningKey, getVerificationKey } from "./keys";
import { pkceChallenge, randomToken, sha256Hex, signJwt, verifyJwt, type JwtPayload } from "./jwt";

/** ID and access tokens live this long; a refresh re-checks access each time. */
export const TOKEN_TTL_SECONDS = 15 * 60;
const CODE_TTL_MS = 60_000;

export const SUPPORTED_SCOPES = ["openid", "profile", "email"] as const;

export type AccessFailure = "login_required" | "two_factor_required" | "no_access" | "account_disabled" | "app_disabled";

type UserRow = typeof users.$inferSelect;
type SessionRow = typeof sessions.$inferSelect;

/** The issuer is the public origin of this install. */
export function getIssuer(env: CloudflareEnv, request: Request): string {
	const configured = env.APP_URL?.trim().replace(/\/+$/, "");
	return configured || new URL(request.url).origin;
}

function primaryDb(env: CloudflareEnv) {
	return getDb({ DB: env.DB_PRIMARY ?? env.DB });
}

export function normalizeScope(scope: string | null | undefined): string | null {
	const requested = new Set((scope ?? "").split(" ").filter(Boolean));
	if (!requested.has("openid")) return null;
	return SUPPORTED_SCOPES.filter((value) => requested.has(value)).join(" ");
}

/**
 * Checks everything an app sign-in needs for this account and session, reading the primary so a
 * revocation or role change elsewhere is seen at once.
 */
export async function checkAccess(
	env: CloudflareEnv,
	app: OidcAppRow,
	userId: string,
	sessionId: string,
): Promise<{ ok: true; user: UserRow; session: SessionRow; roles: string[] } | { ok: false; reason: AccessFailure }> {
	if (app.disabled) return { ok: false, reason: "app_disabled" };
	const db = primaryDb(env);
	const [session] = await db.select().from(sessions).where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId), gt(sessions.expiresAt, new Date()))).limit(1);
	if (!session) return { ok: false, reason: "login_required" };
	const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
	if (!user || user.disabled || user.deletedAt) return { ok: false, reason: "account_disabled" };
	if (!isTwoFactorAmr(session.amr)) return { ok: false, reason: "two_factor_required" };
	const roles = await getAccountAppRoles(env, app, userId);
	if (roles.length === 0) return { ok: false, reason: "no_access" };
	return { ok: true, user, session, roles };
}

export async function createAuthorizationCode(
	env: CloudflareEnv,
	input: { app: OidcAppRow; userId: string; session: SessionRow; redirectUri: string; codeChallenge: string; scope: string; nonce: string | null },
): Promise<string> {
	const code = randomToken(32);
	await getDb(env).insert(oidcAuthorizationCodes).values({
		id: newId("oac"),
		codeHash: await sha256Hex(code),
		appId: input.app.id,
		userId: input.userId,
		sessionId: input.session.id,
		redirectUri: input.redirectUri,
		codeChallenge: input.codeChallenge,
		scope: input.scope,
		nonce: input.nonce,
		authTime: input.session.createdAt,
		expiresAt: new Date(Date.now() + CODE_TTL_MS),
	});
	return code;
}

export type TokenError = { error: "invalid_grant" | "invalid_request" | "access_denied"; description: string };

export type TokenSet = {
	access_token: string;
	token_type: "Bearer";
	expires_in: number;
	id_token: string;
	refresh_token: string;
	scope: string;
	roles: string[];
};

function amrValues(session: SessionRow): string[] {
	try {
		const parsed: unknown = JSON.parse(session.amr ?? "[]");
		return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
	} catch {
		return [];
	}
}

async function issueTokens(
	env: CloudflareEnv,
	input: { issuer: string; app: OidcAppRow; user: UserRow; session: SessionRow; roles: string[]; scope: string; nonce: string | null; authTime: Date; familyId: string },
): Promise<TokenSet> {
	const key = await getSigningKey(env);
	const now = Math.floor(Date.now() / 1000);
	const scopes = new Set(input.scope.split(" "));
	const base = { iss: input.issuer, sub: input.user.id, aud: input.app.clientId, iat: now, exp: now + TOKEN_TTL_SECONDS };
	const profile: JwtPayload = {
		...(scopes.has("email") ? { email: input.user.email, email_verified: true } : {}),
		...(scopes.has("profile") ? { name: input.user.name } : {}),
	};
	const idToken = await signJwt({
		...base,
		azp: input.app.clientId,
		auth_time: Math.floor(input.authTime.getTime() / 1000),
		amr: amrValues(input.session),
		...(input.nonce ? { nonce: input.nonce } : {}),
		...profile,
		roles: input.roles,
	}, key);
	const accessToken = await signJwt({
		...base,
		client_id: input.app.clientId,
		jti: randomToken(16),
		scope: input.scope,
		roles: input.roles,
	}, key, "at+jwt");
	const refreshToken = `mfrt_${randomToken(32)}`;
	await getDb(env).insert(oidcRefreshTokens).values({
		id: newId("ort"),
		tokenHash: await sha256Hex(refreshToken),
		familyId: input.familyId,
		appId: input.app.id,
		userId: input.user.id,
		sessionId: input.session.id,
		scope: input.scope,
		authTime: input.authTime,
		// A refresh token never outlives the Mailflare session it came from.
		expiresAt: input.session.expiresAt,
	});
	return {
		access_token: accessToken,
		token_type: "Bearer",
		expires_in: TOKEN_TTL_SECONDS,
		id_token: idToken,
		refresh_token: refreshToken,
		scope: input.scope,
		roles: input.roles,
	};
}

function denied(reason: AccessFailure): TokenError {
	return { error: reason === "login_required" ? "invalid_grant" : "access_denied", description: reason };
}

export async function exchangeAuthorizationCode(
	env: CloudflareEnv,
	input: { issuer: string; app: OidcAppRow; code: string; redirectUri: string | null; codeVerifier: string | null },
): Promise<TokenSet | TokenError> {
	if (!input.codeVerifier || !/^[A-Za-z0-9._~-]{43,128}$/.test(input.codeVerifier)) {
		return { error: "invalid_request", description: "code_verifier is required (43 to 128 characters)" };
	}
	const db = primaryDb(env);
	// Burn the code first so two concurrent exchanges cannot both succeed.
	const [code] = await db.update(oidcAuthorizationCodes)
		.set({ usedAt: new Date() })
		.where(and(
			eq(oidcAuthorizationCodes.codeHash, await sha256Hex(input.code)),
			eq(oidcAuthorizationCodes.appId, input.app.id),
			isNull(oidcAuthorizationCodes.usedAt),
			gt(oidcAuthorizationCodes.expiresAt, new Date()),
		))
		.returning();
	if (!code) return { error: "invalid_grant", description: "The code is invalid, expired or already used" };
	if (input.redirectUri !== code.redirectUri) return { error: "invalid_grant", description: "redirect_uri does not match" };
	if ((await pkceChallenge(input.codeVerifier)) !== code.codeChallenge) return { error: "invalid_grant", description: "code_verifier does not match" };
	const access = await checkAccess(env, input.app, code.userId, code.sessionId);
	if (!access.ok) return denied(access.reason);
	return issueTokens(env, {
		issuer: input.issuer,
		app: input.app,
		user: access.user,
		session: access.session,
		roles: access.roles,
		scope: code.scope,
		nonce: code.nonce,
		authTime: code.authTime,
		familyId: newId("orf"),
	});
}

export async function refreshTokens(
	env: CloudflareEnv,
	input: { issuer: string; app: OidcAppRow; refreshToken: string },
): Promise<TokenSet | TokenError> {
	const db = primaryDb(env);
	const tokenHash = await sha256Hex(input.refreshToken);
	const [used] = await db.update(oidcRefreshTokens)
		.set({ usedAt: new Date() })
		.where(and(eq(oidcRefreshTokens.tokenHash, tokenHash), eq(oidcRefreshTokens.appId, input.app.id), isNull(oidcRefreshTokens.usedAt), gt(oidcRefreshTokens.expiresAt, new Date())))
		.returning();
	if (!used) {
		// A token that exists but was already used has been replayed: end the whole family.
		const [replayed] = await db.select({ familyId: oidcRefreshTokens.familyId }).from(oidcRefreshTokens)
			.where(and(eq(oidcRefreshTokens.tokenHash, tokenHash), eq(oidcRefreshTokens.appId, input.app.id))).limit(1);
		if (replayed) await db.delete(oidcRefreshTokens).where(eq(oidcRefreshTokens.familyId, replayed.familyId));
		return { error: "invalid_grant", description: "The refresh token is invalid, expired or already used" };
	}
	const access = await checkAccess(env, input.app, used.userId, used.sessionId);
	if (!access.ok) {
		await db.delete(oidcRefreshTokens).where(eq(oidcRefreshTokens.familyId, used.familyId));
		return denied(access.reason);
	}
	return issueTokens(env, {
		issuer: input.issuer,
		app: input.app,
		user: access.user,
		session: access.session,
		roles: access.roles,
		scope: used.scope,
		nonce: null,
		authTime: used.authTime,
		familyId: used.familyId,
	});
}

/** Ends a refresh token's family. Unknown tokens are ignored, as RFC 7009 asks. */
export async function revokeRefreshToken(env: CloudflareEnv, app: OidcAppRow, token: string): Promise<void> {
	const db = primaryDb(env);
	const [row] = await db.select({ familyId: oidcRefreshTokens.familyId }).from(oidcRefreshTokens)
		.where(and(eq(oidcRefreshTokens.tokenHash, await sha256Hex(token)), eq(oidcRefreshTokens.appId, app.id))).limit(1);
	if (row) await db.delete(oidcRefreshTokens).where(eq(oidcRefreshTokens.familyId, row.familyId));
}

/** Verifies an access token this provider issued. Returns its claims, or null. */
export async function verifyAccessToken(env: CloudflareEnv, issuer: string, token: string): Promise<JwtPayload | null> {
	const verified = await verifyJwt(token, (kid) => getVerificationKey(env, kid));
	if (!verified || verified.header.typ !== "at+jwt") return null;
	const { payload } = verified;
	if (payload.iss !== issuer || typeof payload.sub !== "string" || typeof payload.client_id !== "string") return null;
	if (typeof payload.exp !== "number" || payload.exp <= Math.floor(Date.now() / 1000)) return null;
	return payload;
}

/** Removes expired and used codes and expired refresh tokens. Run from the scheduled handler. */
export async function purgeExpiredOidcGrants(env: CloudflareEnv): Promise<void> {
	const db = getDb(env);
	const now = new Date();
	await db.delete(oidcAuthorizationCodes).where(or(lt(oidcAuthorizationCodes.expiresAt, now), lt(oidcAuthorizationCodes.usedAt, new Date(now.getTime() - CODE_TTL_MS))));
	// Used tokens are kept a day so a replay is still recognised and ends its family.
	await db.delete(oidcRefreshTokens).where(or(lt(oidcRefreshTokens.expiresAt, now), lt(oidcRefreshTokens.usedAt, new Date(now.getTime() - 86_400_000))));
}
