// Fork-only: make a group the owner of a shared inbox, or end that. See #lib/groups/ownership.
import { eq } from "drizzle-orm";
import { NextResponse } from "#lib/http/next-compat";
import { getDb } from "#db";
import { groups } from "#db/schema";
import { requireTeamSharingAdmin } from "#handlers/api/accounts/utils";
import { clearMailboxOwnerGroup, setMailboxOwnerGroup } from "#lib/groups/ownership";
import { createAuditLog } from "#lib/mailboxes/audit";
import { mailboxOwnerGroupSchema } from "#lib/validators";
import { getSharedMailboxForAdmin } from "../access/utils";
import type { MailboxOwnerGroupRouteParams } from "./types";

export async function PUT(request: Request, { params }: MailboxOwnerGroupRouteParams) {
	const access = await requireTeamSharingAdmin(request);
	if (access.error) return access.error;
	const parsed = mailboxOwnerGroupSchema.safeParse(await request.json());
	if (!parsed.success) return NextResponse.json({ error: "Choose a valid group" }, { status: 400 });
	const { id } = await params;
	const db = getDb(access.env);
	const mailbox = await getSharedMailboxForAdmin(db, id, access.user!);
	if (!mailbox) return NextResponse.json({ error: "Shared inbox not found" }, { status: 404 });
	const [group] = await db.select({ id: groups.id, name: groups.name }).from(groups).where(eq(groups.id, parsed.data.groupId)).limit(1);
	if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

	await setMailboxOwnerGroup(db, id, group.id, access.user!.id);
	await createAuditLog(access.env, {
		actorUserId: access.user!.id,
		mailboxId: id,
		action: "mailbox.owner_group_set",
		metadata: { groupId: group.id, groupName: group.name },
	});
	return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: MailboxOwnerGroupRouteParams) {
	const access = await requireTeamSharingAdmin(request);
	if (access.error) return access.error;
	const { id } = await params;
	const db = getDb(access.env);
	const mailbox = await getSharedMailboxForAdmin(db, id, access.user!);
	if (!mailbox) return NextResponse.json({ error: "Shared inbox not found" }, { status: 404 });
	if (await clearMailboxOwnerGroup(db, id)) {
		await createAuditLog(access.env, { actorUserId: access.user!.id, mailboxId: id, action: "mailbox.owner_group_cleared" });
	}
	return NextResponse.json({ ok: true });
}
