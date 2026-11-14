// Fork-only. Issues a new client secret for an app. The old one stops working at once.
import { NextResponse } from "#lib/http/next-compat";
import { eq } from "drizzle-orm";
import { getDb } from "#db";
import { oidcApps } from "#db/schema";
import { createAuditLog } from "#lib/mailboxes/audit";
import { newClientSecret, serializeApp } from "#lib/oidc/apps";
import { authorizeAppAdmin } from "#lib/oidc/admin";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
	const access = await authorizeAppAdmin(request, { mutation: true });
	if (access.error) return access.error;
	const secret = await newClientSecret();
	const [app] = await getDb(access.env).update(oidcApps)
		.set({ clientSecretHash: secret.hash, clientSecretPrefix: secret.prefix, updatedAt: new Date() })
		.where(eq(oidcApps.id, (await params).id)).returning();
	if (!app) return NextResponse.json({ error: "App not found" }, { status: 404 });
	await createAuditLog(access.env, { actorUserId: access.user.id, action: "oidc.app_secret_rotated", metadata: { appId: app.id, name: app.name } });
	return NextResponse.json({ app: serializeApp(app), clientSecret: secret.secret }, { headers: { "Cache-Control": "no-store" } });
}
