// Fork-only: brings back a deleted shared drive before the account purge removes it, with its files and members.
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { NextResponse } from "#lib/http/next-compat";
import { sharedDrives, users } from "#db/schema";
import { authorizeDrive } from "#lib/drive/auth";
import { canCreateSharedDrives } from "#lib/drive/shared-drives";
import { createAuditLog } from "#lib/mailboxes/audit";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const auth = await authorizeDrive(request, true);
	if (auth.error) return auth.error;
	const { env, db, user } = auth;
	if (!canCreateSharedDrives(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	const [drive] = await db
		.select({ id: sharedDrives.id, name: users.name })
		.from(sharedDrives)
		.innerJoin(users, eq(users.id, sharedDrives.id))
		.where(and(eq(sharedDrives.id, id), isNotNull(users.deletedAt)))
		.limit(1);
	if (!drive) return NextResponse.json({ error: "Drive not found" }, { status: 404 });
	await db.update(users).set({ deletedAt: null, disabled: false }).where(and(eq(users.id, id), sql`"users"."kind" = 'drive'`));
	await createAuditLog(env, { actorUserId: user.id, targetUserId: id, action: "drive.restored", metadata: { name: drive.name } });
	return NextResponse.json({ ok: true });
}
