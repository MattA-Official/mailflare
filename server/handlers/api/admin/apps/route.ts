// Fork-only. Lists and registers apps that sign people in through Mailflare (OIDC).
import { NextResponse } from "#lib/http/next-compat";
import { asc, sql } from "drizzle-orm";
import { getDb } from "#db";
import { oidcAppRoles, oidcApps } from "#db/schema";
import { newId } from "#lib/ids";
import { createAuditLog } from "#lib/mailboxes/audit";
import { appInputSchema, newClientId, newClientSecret, serializeApp } from "#lib/oidc/apps";
import { authorizeAppAdmin } from "#lib/oidc/admin";
import { readJsonBody } from "#lib/http/request";

export async function GET(request: Request) {
	const access = await authorizeAppAdmin(request);
	if (access.error) return access.error;
	const db = getDb(access.env);
	const apps = await db.select().from(oidcApps).orderBy(asc(oidcApps.name));
	const counts = await db.select({ appId: oidcAppRoles.appId, count: sql<number>`count(*)` }).from(oidcAppRoles)
		.where(sql`${oidcAppRoles.roles} != '[]'`).groupBy(oidcAppRoles.appId);
	const memberCounts = new Map(counts.map((row) => [row.appId, Number(row.count)]));
	return NextResponse.json({ apps: apps.map((app) => ({ ...serializeApp(app), memberCount: memberCounts.get(app.id) ?? 0 })) });
}

export async function POST(request: Request) {
	const access = await authorizeAppAdmin(request, { mutation: true });
	if (access.error) return access.error;
	const body = await readJsonBody(request, 64 * 1024).catch(() => null) as Record<string, unknown> | null;
	const parsed = appInputSchema.safeParse(body);
	if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid app" }, { status: 400 });
	const confidential = body?.confidential !== false;
	const secret = confidential ? await newClientSecret() : null;
	const now = new Date();
	const [app] = await getDb(access.env).insert(oidcApps).values({
		id: newId("app"),
		clientId: newClientId(),
		name: parsed.data.name,
		homepageUrl: parsed.data.homepageUrl ?? null,
		redirectUris: JSON.stringify([...new Set(parsed.data.redirectUris)]),
		roles: JSON.stringify(parsed.data.roles),
		clientSecretHash: secret?.hash ?? null,
		clientSecretPrefix: secret?.prefix ?? null,
		disabled: parsed.data.disabled ?? false,
		createdByUserId: access.user.id,
		createdAt: now,
		updatedAt: now,
	}).returning();
	await createAuditLog(access.env, { actorUserId: access.user.id, action: "oidc.app_created", metadata: { appId: app.id, name: app.name } });
	return NextResponse.json({ app: serializeApp(app), clientSecret: secret?.secret ?? null }, { headers: { "Cache-Control": "no-store" } });
}
