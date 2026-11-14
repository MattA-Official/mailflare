// Fork-only: restore a deleted shared inbox within the restore window. See #lib/mailboxes/principals.
import { eq } from "drizzle-orm";
import { NextResponse } from "#lib/http/next-compat";
import { getDb } from "#db";
import { mailboxes } from "#db/schema";
import { hasValidSessionMutationOrigin } from "#lib/auth/origin";
import { canManageSharedInbox } from "#lib/groups/permissions";
import { createAuditLog } from "#lib/mailboxes/audit";
import { ensureMailboxDomainRouting } from "#lib/mailboxes/domain-addresses";
import { restoreSharedInbox } from "#lib/mailboxes/principals";
import { requireSharingUser } from "#handlers/api/mailboxes/[id]/access/utils";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
	const access = await requireSharingUser(request);
	if (access.error) return access.error;
	if (!canManageSharedInbox(access.user!, { userId: "", type: "shared" })) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	if (!hasValidSessionMutationOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
	const { id } = await params;
	const db = getDb(access.env);
	if (!(await restoreSharedInbox(db, id))) return NextResponse.json({ error: "Shared inbox not found" }, { status: 404 });
	const [mailbox] = await db.select().from(mailboxes).where(eq(mailboxes.id, id)).limit(1);
	try {
		await ensureMailboxDomainRouting(access.env, db, mailbox!);
	} catch (error) {
		await db.update(mailboxes).set({ disabled: true }).where(eq(mailboxes.id, id));
		return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to restore Cloudflare routing" }, { status: 502 });
	}
	await createAuditLog(access.env, { actorUserId: access.user!.id, mailboxId: id, action: "mailbox.restored" });
	return NextResponse.json({ ok: true });
}
