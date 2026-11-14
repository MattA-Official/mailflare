// Fork-only. One app registered with the OIDC provider: details and members, edit, delete.
import { NextResponse } from "#lib/http/next-compat";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "#db";
import { oidcAppRoles, oidcApps, oidcRefreshTokens, users } from "#db/schema";
import { createAuditLog } from "#lib/mailboxes/audit";
import { appInputSchema, effectiveRoles, parseRoleKeys, serializeApp } from "#lib/oidc/apps";
import { authorizeAppAdmin } from "#lib/oidc/admin";
import { readJsonBody } from "#lib/http/request";

type Params = { params: Promise<{ id: string }> };

async function findApp(env: CloudflareEnv, id: string) {
	const [app] = await getDb(env).select().from(oidcApps).where(eq(oidcApps.id, id)).limit(1);
	return app ?? null;
}

export async function GET(request: Request, { params }: Params) {
	const access = await authorizeAppAdmin(request);
	if (access.error) return access.error;
	const app = await findApp(access.env, (await params).id);
	if (!app) return NextResponse.json({ error: "App not found" }, { status: 404 });
	const rows = await getDb(access.env).select({ userId: users.id, name: users.name, email: users.email, disabled: users.disabled, roles: oidcAppRoles.roles })
		.from(oidcAppRoles).innerJoin(users, eq(users.id, oidcAppRoles.userId))
		.where(eq(oidcAppRoles.appId, app.id)).orderBy(asc(users.name));
	const members = rows
		.map((row) => ({ userId: row.userId, name: row.name, email: row.email, disabled: row.disabled, roles: effectiveRoles(app, parseRoleKeys(row.roles)) }))
		.filter((member) => member.roles.length > 0);
	return NextResponse.json({ app: serializeApp(app), members });
}

export async function PATCH(request: Request, { params }: Params) {
	const access = await authorizeAppAdmin(request, { mutation: true });
	if (access.error) return access.error;
	const app = await findApp(access.env, (await params).id);
	if (!app) return NextResponse.json({ error: "App not found" }, { status: 404 });
	const parsed = appInputSchema.safeParse(await readJsonBody(request, 64 * 1024).catch(() => null));
	if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid app" }, { status: 400 });
	const db = getDb(access.env);
	const [updated] = await db.update(oidcApps).set({
		name: parsed.data.name,
		homepageUrl: parsed.data.homepageUrl ?? null,
		redirectUris: JSON.stringify([...new Set(parsed.data.redirectUris)]),
		roles: JSON.stringify(parsed.data.roles),
		disabled: parsed.data.disabled ?? app.disabled,
		updatedAt: new Date(),
	}).where(eq(oidcApps.id, app.id)).returning();
	// Switching an app off ends every refresh token it holds.
	if (updated.disabled && !app.disabled) await db.delete(oidcRefreshTokens).where(eq(oidcRefreshTokens.appId, app.id));
	await createAuditLog(access.env, { actorUserId: access.user.id, action: "oidc.app_updated", metadata: { appId: app.id, name: updated.name, disabled: updated.disabled } });
	return NextResponse.json({ app: serializeApp(updated) });
}

export async function DELETE(request: Request, { params }: Params) {
	const access = await authorizeAppAdmin(request, { mutation: true });
	if (access.error) return access.error;
	const app = await findApp(access.env, (await params).id);
	if (!app) return NextResponse.json({ error: "App not found" }, { status: 404 });
	// Roles, codes and refresh tokens go with it (ON DELETE CASCADE).
	await getDb(access.env).delete(oidcApps).where(and(eq(oidcApps.id, app.id)));
	await createAuditLog(access.env, { actorUserId: access.user.id, action: "oidc.app_deleted", metadata: { appId: app.id, name: app.name } });
	return NextResponse.json({ ok: true });
}
