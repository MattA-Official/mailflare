// Fork-only: shared inboxes hold themselves. Each shared inbox is held by a hidden account of its own, an
// "inbox principal" (users.kind = "inbox"), rather than by the admin who created it. Upstream keys stored
// mail, folders, contacts and mail settings by user id, so pointing mailboxes.user_id at the principal makes
// all of that belong to the inbox without touching those queries. People reach the inbox only through
// grants. The principal has no password, passkey, session or API key and is refused everywhere a person
// signs in or is listed. Migration 0093 converted the shared inboxes that existed before this.
import { and, eq, sql } from "drizzle-orm";
import type { AppDatabase } from "#db";
import { mailboxAccess, mailboxes, users } from "#db/schema";
import { accountKinds } from "#lib/accounts/kind";
import { PASSWORDLESS_PASSWORD_HASH } from "#lib/auth/password";
import { newId } from "#lib/ids";

/** The principal's id for a shared inbox. Deterministic, so the migration and the app agree. */
export function inboxPrincipalId(mailboxId: string): string {
	return `inbox_${mailboxId}`;
}

/** Never routable (RFC 2606 `.invalid`), and never the inbox's real address, which a person might sign in with. */
export function inboxPrincipalEmail(mailboxId: string): string {
	return `${mailboxId}@inbox.invalid`;
}

type SettingsSource = Pick<typeof users.$inferSelect, "spamProtectionEnabled" | "trashRetentionDays" | "remoteContentMode" | "showFullRecipientAddresses">;

/**
 * Creates the hidden account that will hold a new shared inbox. Call before inserting the mailbox with
 * `userId: inboxPrincipalId(mailboxId)`. Mail settings start as the creating admin's.
 */
export async function createInboxPrincipal(
	db: AppDatabase,
	input: { mailboxId: string; name: string; settingsFrom?: Partial<SettingsSource> | null },
): Promise<string> {
	const id = inboxPrincipalId(input.mailboxId);
	const settings = input.settingsFrom ?? {};
	await db.insert(users).values({
		id,
		email: inboxPrincipalEmail(input.mailboxId),
		passwordHash: PASSWORDLESS_PASSWORD_HASH,
		name: input.name.trim() || input.mailboxId,
		role: "user",
		...(settings.spamProtectionEnabled !== undefined ? { spamProtectionEnabled: settings.spamProtectionEnabled } : {}),
		...(settings.trashRetentionDays !== undefined ? { trashRetentionDays: settings.trashRetentionDays } : {}),
		...(settings.remoteContentMode !== undefined ? { remoteContentMode: settings.remoteContentMode } : {}),
		...(settings.showFullRecipientAddresses !== undefined ? { showFullRecipientAddresses: settings.showFullRecipientAddresses } : {}),
	});
	await db.update(accountKinds).set({ kind: "inbox" }).where(eq(accountKinds.id, id));
	return id;
}

/** Removes a principal made for a mailbox that then failed to be created. */
export async function discardInboxPrincipal(db: AppDatabase, mailboxId: string): Promise<void> {
	await db.delete(users).where(eq(users.id, inboxPrincipalId(mailboxId)));
}

/** Gives the creating admin full access, so a new shared inbox is never unreachable. */
export async function grantCreatorFullAccess(db: AppDatabase, mailboxId: string, creatorId: string): Promise<void> {
	await db
		.insert(mailboxAccess)
		.values({ id: newId("mba"), mailboxId, userId: creatorId, permission: "full_access", createdByUserId: creatorId })
		.onConflictDoUpdate({ target: [mailboxAccess.mailboxId, mailboxAccess.userId], set: { permission: "full_access" } });
}

/**
 * Deletes a shared inbox. Its routing is removed by the caller first. The inbox is disabled and its principal
 * marked deleted, so the scheduled account purge removes the stored mail and R2 objects after the restore
 * window, exactly as it does for a person's account.
 */
export async function retireSharedInbox(db: AppDatabase, mailbox: { id: string; userId: string }): Promise<void> {
	await db.update(mailboxes).set({ disabled: true }).where(eq(mailboxes.id, mailbox.id));
	// Only ever the inbox's own principal: never the account of a person.
	if (mailbox.userId !== inboxPrincipalId(mailbox.id)) return;
	await db.update(users).set({ deletedAt: new Date(), disabled: true }).where(and(eq(users.id, mailbox.userId), sql`"users"."kind" = 'inbox'`));
}

/**
 * Brings back a shared inbox deleted with retireSharedInbox, while its holder still exists (the account purge
 * removes it after the restore window). The caller restores its routing. Returns false when it is gone.
 */
export async function restoreSharedInbox(db: AppDatabase, mailboxId: string): Promise<boolean> {
	const principalId = inboxPrincipalId(mailboxId);
	const [mailbox] = await db
		.select({ id: mailboxes.id })
		.from(mailboxes)
		.where(and(eq(mailboxes.id, mailboxId), eq(mailboxes.type, "shared"), eq(mailboxes.userId, principalId)))
		.limit(1);
	if (!mailbox) return false;
	await db.update(users).set({ deletedAt: null, disabled: false }).where(and(eq(users.id, principalId), sql`"users"."kind" = 'inbox'`));
	await db.update(mailboxes).set({ disabled: false }).where(eq(mailboxes.id, mailboxId));
	return true;
}
