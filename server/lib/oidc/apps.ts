// Fork-only. Apps registered with the OIDC provider and the roles accounts hold in them.
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "#db";
import { oidcAppRoles, oidcApps } from "#db/schema";
import { randomToken, sha256Hex, timingSafeEqual } from "./jwt";

export type OidcAppRole = { key: string; label: string; description?: string };
export type OidcAppRow = typeof oidcApps.$inferSelect;

export const ROLE_KEY_PATTERN = /^[a-z][a-z0-9_.-]{0,39}$/;

export const appRoleSchema = z.object({
	key: z.string().trim().regex(ROLE_KEY_PATTERN, "Role keys are lower case letters, digits, dots, dashes and underscores, starting with a letter"),
	label: z.string().trim().min(1).max(60),
	description: z.string().trim().max(200).optional(),
});

/**
 * Redirect URIs must be absolute https URLs without a fragment. Plain http is allowed only for
 * localhost, so an app can be tried out on a developer machine.
 */
export function isAllowedRedirectUri(value: string): boolean {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return false;
	}
	if (url.hash || url.username || url.password) return false;
	if (url.protocol === "https:") return true;
	return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]");
}

export const redirectUriSchema = z.string().trim().max(500).refine(isAllowedRedirectUri, "Use an https URL without a fragment (http is allowed for localhost)");

export const appInputSchema = z.object({
	name: z.string().trim().min(1).max(80),
	homepageUrl: z.string().trim().url().max(500).refine((value) => value.startsWith("https://") || value.startsWith("http://localhost"), "Use an https URL").nullable().optional(),
	redirectUris: z.array(redirectUriSchema).min(1).max(10),
	roles: z.array(appRoleSchema).min(1).max(20).refine((roles) => new Set(roles.map((role) => role.key)).size === roles.length, "Role keys must be unique"),
	disabled: z.boolean().optional(),
});

function parseJsonArray<T>(value: string | null | undefined, guard: (item: unknown) => item is T): T[] {
	if (!value) return [];
	try {
		const parsed: unknown = JSON.parse(value);
		return Array.isArray(parsed) ? parsed.filter(guard) : [];
	} catch {
		return [];
	}
}

const isString = (item: unknown): item is string => typeof item === "string";
const isRole = (item: unknown): item is OidcAppRole => !!item && typeof item === "object" && typeof (item as OidcAppRole).key === "string" && typeof (item as OidcAppRole).label === "string";

export function parseRedirectUris(app: Pick<OidcAppRow, "redirectUris">): string[] {
	return parseJsonArray(app.redirectUris, isString);
}

export function parseAppRoles(app: Pick<OidcAppRow, "roles">): OidcAppRole[] {
	return parseJsonArray(app.roles, isRole);
}

export function parseRoleKeys(value: string | null | undefined): string[] {
	return parseJsonArray(value, isString);
}

/** The roles an account holds that the app still offers, in the app's order. */
export function effectiveRoles(app: Pick<OidcAppRow, "roles">, granted: string[]): string[] {
	const held = new Set(granted);
	return parseAppRoles(app).map((role) => role.key).filter((key) => held.has(key));
}

export function newClientId(): string {
	return `mfc_${randomToken(16)}`;
}

/** A new client secret: the full value (shown once), its prefix for display and its SHA-256 hash. */
export async function newClientSecret(): Promise<{ secret: string; prefix: string; hash: string }> {
	const secret = `mfcs_${randomToken(32)}`;
	return { secret, prefix: secret.slice(0, 10), hash: await sha256Hex(secret) };
}

export async function verifyClientSecret(app: Pick<OidcAppRow, "clientSecretHash">, secret: string | null): Promise<boolean> {
	if (!app.clientSecretHash) return true;
	if (!secret) return false;
	return timingSafeEqual(await sha256Hex(secret), app.clientSecretHash);
}

export async function findAppByClientId(env: CloudflareEnv, clientId: string | null | undefined): Promise<OidcAppRow | null> {
	if (!clientId || clientId.length > 100) return null;
	const db = getDb({ DB: env.DB_PRIMARY ?? env.DB });
	const [app] = await db.select().from(oidcApps).where(eq(oidcApps.clientId, clientId)).limit(1);
	return app ?? null;
}

/** The roles the account currently holds in the app; empty means no access. Always read from the primary. */
export async function getAccountAppRoles(env: CloudflareEnv, app: OidcAppRow, userId: string): Promise<string[]> {
	const db = getDb({ DB: env.DB_PRIMARY ?? env.DB });
	const [row] = await db.select({ roles: oidcAppRoles.roles }).from(oidcAppRoles).where(and(eq(oidcAppRoles.appId, app.id), eq(oidcAppRoles.userId, userId))).limit(1);
	return effectiveRoles(app, parseRoleKeys(row?.roles));
}

/** The shape the admin API returns for an app. Never includes the secret hash. */
export function serializeApp(app: OidcAppRow) {
	return {
		id: app.id,
		clientId: app.clientId,
		name: app.name,
		homepageUrl: app.homepageUrl,
		redirectUris: parseRedirectUris(app),
		roles: parseAppRoles(app),
		confidential: !!app.clientSecretHash,
		clientSecretPrefix: app.clientSecretPrefix,
		disabled: app.disabled,
		createdAt: app.createdAt,
		updatedAt: app.updatedAt,
	};
}
