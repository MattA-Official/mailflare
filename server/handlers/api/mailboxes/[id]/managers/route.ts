// Fork-only: groups that manage a shared inbox. POST makes a group a manager (and gives it full access);
// DELETE stops it managing, leaving its grant. See #lib/groups/managers.
import { eq } from "drizzle-orm";
import { NextResponse } from "#lib/http/next-compat";
import { getDb } from "#db";
import { groups } from "#db/schema";
import { addMailboxManager, removeMailboxManager } from "#lib/groups/managers";
import { createAuditLog } from "#lib/mailboxes/audit";
import { mailboxManagerSchema } from "#lib/validators";
import { getSharedMailboxForManager, requireSharingUser } from "../access/utils";
import type { MailboxManagersRouteParams } from "./types";

export async function POST(request: Request, { params }: MailboxManagersRouteParams) {
	const access = await requireSharingUser(request);
	if (access.error) return access.error;
	const parsed = mailboxManagerSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ error: "Choose a valid group" }, { status: 400 });
	const { id } = await params;
	const db = getDb(access.env);
	const mailbox = await getSharedMailboxForManager(db, id, access.user!);
	if (!mailbox) return NextResponse.json({ error: "Shared inbox not found" }, { status: 404 });
	const [group] = await db.select({ id: groups.id, name: groups.name }).from(groups).where(eq(groups.id, parsed.data.groupId)).limit(1);
	if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

	await addMailboxManager(db, id, group.id, access.user!.id);
	await createAuditLog(access.env, {
		actorUserId: access.user!.id,
		mailboxId: id,
		action: "mailbox.manager_added",
		metadata: { groupId: group.id, groupName: group.name },
	});
	return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: MailboxManagersRouteParams) {
	const access = await requireSharingUser(request);
	if (access.error) return access.error;
	const { id } = await params;
	const groupId = new URL(request.url).searchParams.get("groupId");
	if (!groupId) return NextResponse.json({ error: "Group is required" }, { status: 400 });
	const db = getDb(access.env);
	const mailbox = await getSharedMailboxForManager(db, id, access.user!);
	if (!mailbox) return NextResponse.json({ error: "Shared inbox not found" }, { status: 404 });
	if (await removeMailboxManager(db, id, groupId)) {
		await createAuditLog(access.env, { actorUserId: access.user!.id, mailboxId: id, action: "mailbox.manager_removed", metadata: { groupId } });
	}
	return NextResponse.json({ ok: true });
}
