import { NextResponse } from "#lib/http/next-compat";
import { getDb } from "#db";
import { requireUser } from "#lib/auth/cookies";
import { getEnv } from "#lib/cloudflare";
import { blockContact, unblockContact } from "#lib/contacts/service";
import { getMailboxAccessLevel } from "#lib/mailboxes/access";
import type { BlockContactRequest } from "./types";

export async function POST(request: Request) {
	const env = getEnv();
	const user = await requireUser(env, request);
	const body = (await request.json()) as BlockContactRequest;
	if (!body.mailboxId || !body.address?.trim()) {
		return NextResponse.json({ error: "Mailbox and contact are required" }, { status: 400 });
	}

	const access = await getMailboxAccessLevel(getDb(env), user, body.mailboxId);
	if (!access?.canManage) {
		return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });
	}

	const contact = await blockContact(env, {
		userId: access.mailbox.userId,
		mailboxId: access.mailbox.id,
		domainId: access.mailbox.domainId,
		address: body.address,
	});
	return NextResponse.json({ contact });
}

// Fork-only: unblock, from the contact panel.
export async function DELETE(request: Request) {
	const env = getEnv();
	const user = await requireUser(env, request);
	const url = new URL(request.url);
	const mailboxId = url.searchParams.get("mailboxId");
	const address = url.searchParams.get("address")?.trim();
	if (!mailboxId || !address) {
		return NextResponse.json({ error: "Mailbox and contact are required" }, { status: 400 });
	}

	const access = await getMailboxAccessLevel(getDb(env), user, mailboxId);
	if (!access?.canManage) {
		return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });
	}

	const contact = await unblockContact(env, {
		userId: access.mailbox.userId,
		mailboxId: access.mailbox.id,
		address,
	});
	return NextResponse.json({ contact });
}
