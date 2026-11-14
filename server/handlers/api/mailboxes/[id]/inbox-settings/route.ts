import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { NextResponse } from "#lib/http/next-compat";
import { getDb, type AppDatabase } from "#db";
import { mailboxes, users } from "#db/schema";
import { requireUser } from "#lib/auth/cookies";
import { getEnv } from "#lib/cloudflare";
import { normalizeTrashRetentionDays } from "#lib/email/trash-retention-utils";
import { inboxPrincipalId } from "#lib/mailboxes/principals";
import { getMailboxSettingsAccess } from "#lib/mailboxes/settings-access";
import { updateSpamSettingsSchema, updateTrashRetentionSettingsSchema } from "#lib/validators";
import type { MailboxRouteParams } from "../types";

/**
 * Fork-only: settings that belong to a shared inbox's hidden account rather than to a person.
 * Spam protection is read from the mailbox's holder when mail arrives, and trash retention runs
 * per message owner, so for a shared inbox both live on the principal.
 */
const updateInboxSettingsSchema = z.object({
	spamProtectionEnabled: updateSpamSettingsSchema.shape.enabled.optional(),
	trashRetentionDays: updateTrashRetentionSettingsSchema.shape.days.optional(),
});

async function loadPrincipal(db: AppDatabase, mailboxId: string) {
	const principalId = inboxPrincipalId(mailboxId);
	const [row] = await db
		.select({ id: users.id, spamProtectionEnabled: users.spamProtectionEnabled, trashRetentionDays: users.trashRetentionDays })
		.from(mailboxes)
		.innerJoin(users, eq(users.id, mailboxes.userId))
		.where(and(eq(mailboxes.id, mailboxId), eq(mailboxes.type, "shared"), eq(mailboxes.userId, principalId)))
		.limit(1);
	return row ?? null;
}

function toSettings(row: { spamProtectionEnabled: boolean; trashRetentionDays: number | null }) {
	return { spamProtectionEnabled: row.spamProtectionEnabled, trashRetentionDays: normalizeTrashRetentionDays(row.trashRetentionDays) };
}

export async function GET(request: Request, { params }: MailboxRouteParams) {
	const { id } = await params;
	const env = getEnv();
	const user = await requireUser(env, request);
	const access = await getMailboxSettingsAccess(env, user, id);
	if (!access?.canRead) return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });
	const principal = await loadPrincipal(getDb(env), id);
	if (!principal) return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });
	return NextResponse.json({ settings: toSettings(principal), canManage: access.canManage });
}

export async function PATCH(request: Request, { params }: MailboxRouteParams) {
	const { id } = await params;
	const env = getEnv();
	const user = await requireUser(env, request);
	const parsed = updateInboxSettingsSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

	const access = await getMailboxSettingsAccess(env, user, id);
	const db = getDb(env);
	const principal = access?.canManage ? await loadPrincipal(db, id) : null;
	if (!principal) return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });

	const values: Partial<typeof users.$inferInsert> = {};
	if (parsed.data.spamProtectionEnabled !== undefined) values.spamProtectionEnabled = parsed.data.spamProtectionEnabled;
	if (parsed.data.trashRetentionDays !== undefined) values.trashRetentionDays = parsed.data.trashRetentionDays;
	if (Object.keys(values).length) {
		await db.update(users).set(values).where(eq(users.id, principal.id));
	}
	return NextResponse.json({ settings: toSettings({ ...principal, ...values }), canManage: true });
}
