// Fork-only. The roles one account holds in each app that signs in through Mailflare (OIDC).
import { NextResponse } from "#lib/http/next-compat";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "#db";
import { oidcAppRoles, oidcApps, oidcRefreshTokens, users } from "#db/schema";
import { newId } from "#lib/ids";
import { createAuditLog } from "#lib/mailboxes/audit";
import { effectiveRoles, parseAppRoles, parseRoleKeys, serializeApp } from "#lib/oidc/apps";
import { authorizeAppAdmin } from "#lib/oidc/admin";
import { readJsonBody } from "#lib/http/request";

type Params = { params: Promise<{ id: string }> };

const updateSchema = z.object({ appId: z.string().min(1).max(100), roles: z.array(z.string().max(40)).max(20) });

async function findAccount(env: CloudflareEnv, id: string) {
	const [account] = await getDb(env).select().from(users).where(eq(users.id, id)).limit(1);
	return account ?? null;
}

export async function GET(request: Request, { params }: Params) {
	const access = await authorizeAppAdmin(request);
	if (access.error) return access.error;
	const account = await findAccount(access.env, (await params).id);
	if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });
	const db = getDb(access.env);
	const apps = await db.select().from(oidcApps).orderBy(asc(oidcApps.name));
	const held = await db.select({ appId: oidcAppRoles.appId, roles: oidcAppRoles.roles }).from(oidcAppRoles).where(eq(oidcAppRoles.userId, account.id));
	const byApp = new Map(held.map((row) => [row.appId, parseRoleKeys(row.roles)]));
	return NextResponse.json({
		// Apps accept only sessions signed in with two factors; say whether this account can do that.
		twoFactorReady: account.passkeyCount > 0 || (account.totpEnabled && account.requireSecondFactor),
		apps: apps.map((app) => ({ ...serializeApp(app), heldRoles: effectiveRoles(app, byApp.get(app.id) ?? []) })),
	});
}

export async function PUT(request: Request, { params }: Params) {
	const access = await authorizeAppAdmin(request, { mutation: true });
	if (access.error) return access.error;
	const account = await findAccount(access.env, (await params).id);
	if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });
	const parsed = updateSchema.safeParse(await readJsonBody(request, 16 * 1024).catch(() => null));
	if (!parsed.success) return NextResponse.json({ error: "Invalid roles" }, { status: 400 });
	const db = getDb(access.env);
	const [app] = await db.select().from(oidcApps).where(eq(oidcApps.id, parsed.data.appId)).limit(1);
	if (!app) return NextResponse.json({ error: "App not found" }, { status: 404 });
	const offered = new Set(parseAppRoles(app).map((role) => role.key));
	const unknown = parsed.data.roles.filter((role) => !offered.has(role));
	if (unknown.length) return NextResponse.json({ error: `Unknown role: ${unknown[0]}` }, { status: 400 });
	const roles = effectiveRoles(app, parsed.data.roles);
	const now = new Date();
	const [existing] = await db.select().from(oidcAppRoles).where(and(eq(oidcAppRoles.appId, app.id), eq(oidcAppRoles.userId, account.id))).limit(1);
	const previous = effectiveRoles(app, parseRoleKeys(existing?.roles));
	if (roles.length === 0) {
		await db.delete(oidcAppRoles).where(and(eq(oidcAppRoles.appId, app.id), eq(oidcAppRoles.userId, account.id)));
		// No roles left: end the app's refresh tokens for this account now rather than at the next refresh.
		await db.delete(oidcRefreshTokens).where(and(eq(oidcRefreshTokens.appId, app.id), eq(oidcRefreshTokens.userId, account.id)));
	} else if (existing) {
		await db.update(oidcAppRoles).set({ roles: JSON.stringify(roles), grantedByUserId: access.user.id, updatedAt: now }).where(eq(oidcAppRoles.id, existing.id));
	} else {
		await db.insert(oidcAppRoles).values({ id: newId("oar"), appId: app.id, userId: account.id, roles: JSON.stringify(roles), grantedByUserId: access.user.id, createdAt: now, updatedAt: now });
	}
	await createAuditLog(access.env, {
		actorUserId: access.user.id,
		targetUserId: account.id,
		action: "oidc.app_roles_changed",
		metadata: { appId: app.id, app: app.name, from: previous, to: roles },
	});
	return NextResponse.json({ ok: true, roles });
}
