import { and, eq } from "drizzle-orm";
import type { AppDatabase } from "#db";
import { domains, groupMembers, mailboxAccess, mailboxGroupAccess, mailboxes, users } from "#db/schema";
import { getAccountStatus } from "#lib/accounts/deletion-utils";
import type { SessionUser } from "#lib/auth/types";
import type { MailboxAccessLevel, MailboxPermission } from "./types";

const permissionRank: Record<MailboxPermission, number> = {
	read_only: 1,
	send_on_behalf: 2,
	send_as: 3,
	full_access: 4,
};

export function hasMailboxPermission(permission: MailboxPermission, required: MailboxPermission): boolean {
	return permissionRank[permission] >= permissionRank[required];
}

export async function getMailboxAccessLevel(
	db: AppDatabase,
	user: Pick<SessionUser, "id" | "role">,
	mailboxId: string,
): Promise<MailboxAccessLevel | null> {
	const [mailbox] = await db.select().from(mailboxes).where(eq(mailboxes.id, mailboxId)).limit(1);
	if (!mailbox || mailbox.disabled) return null;

	const isOwner = mailbox.userId === user.id;
	if (isOwner) return buildAccess(mailbox, "full_access", true);
	if (mailbox.type !== "shared") return null;

	const [directGrants, groupGrants] = await Promise.all([
		db
			.select({ permission: mailboxAccess.permission })
			.from(mailboxAccess)
			.where(and(eq(mailboxAccess.mailboxId, mailbox.id), eq(mailboxAccess.userId, user.id)))
			.limit(1),
		// Fork-only: grants to any group the user belongs to.
		db
			.select({ permission: mailboxGroupAccess.permission })
			.from(mailboxGroupAccess)
			.innerJoin(groupMembers, eq(mailboxGroupAccess.groupId, groupMembers.groupId))
			.where(and(eq(mailboxGroupAccess.mailboxId, mailbox.id), eq(groupMembers.userId, user.id))),
	]);
	const permission = highestPermission([...directGrants, ...groupGrants].map((grant) => grant.permission));
	if (permission) return buildAccess(mailbox, permission, false);

	return null;
}

/** The highest of several permission levels, or null when there are none. */
export function highestPermission(permissions: MailboxPermission[]): MailboxPermission | null {
	let highest: MailboxPermission | null = null;
	for (const permission of permissions) {
		if (!highest || permissionRank[permission] > permissionRank[highest]) highest = permission;
	}
	return highest;
}

export async function listAccessibleMailboxes(db: AppDatabase, user: Pick<SessionUser, "id" | "email" | "role">) {
	const ownedRows = await db
		.select({
			id: mailboxes.id,
			userId: mailboxes.userId,
			domainId: mailboxes.domainId,
		localPart: mailboxes.localPart,
		displayName: mailboxes.displayName,
		signature: mailboxes.signature,
		autoReplyEnabled: mailboxes.autoReplyEnabled,
		autoReplySubject: mailboxes.autoReplySubject,
		autoReplyBody: mailboxes.autoReplyBody,
		useAllDomains: mailboxes.useAllDomains,
			avatarKey: mailboxes.avatarKey,
			type: mailboxes.type,
			disabled: mailboxes.disabled,
			createdAt: mailboxes.createdAt,
			hostname: domains.hostname,
			ownerLastSignInAt: users.lastSignInAt,
			ownerDisabled: users.disabled,
			ownerDeletedAt: users.deletedAt,
		})
		.from(mailboxes)
		.innerJoin(domains, eq(mailboxes.domainId, domains.id))
		.leftJoin(users, eq(mailboxes.userId, users.id))
		.where(and(eq(mailboxes.userId, user.id), eq(mailboxes.disabled, false)));
	const owned = ownedRows
		.map((row) => {
			const { avatarKey, ownerLastSignInAt, ownerDisabled, ownerDeletedAt, ...mailbox } = row;
			return {
				...mailbox,
				hasAvatar: !!avatarKey,
				status: row.type === "shared" ? "active" as const : getAccountStatus({ disabled: !!ownerDisabled, deletedAt: ownerDeletedAt }),
				lastSignInAt: row.type === "shared" ? null : ownerLastSignInAt ?? null,
				permission: "full_access" as MailboxPermission,
				isPrimary: `${row.localPart}@${row.hostname}` === user.email,
			};
		});

	const sharedRows = await db
		.select({
			id: mailboxes.id,
			userId: mailboxes.userId,
			domainId: mailboxes.domainId,
		localPart: mailboxes.localPart,
		displayName: mailboxes.displayName,
		signature: mailboxes.signature,
		autoReplyEnabled: mailboxes.autoReplyEnabled,
		autoReplySubject: mailboxes.autoReplySubject,
		autoReplyBody: mailboxes.autoReplyBody,
		useAllDomains: mailboxes.useAllDomains,
			avatarKey: mailboxes.avatarKey,
			type: mailboxes.type,
			disabled: mailboxes.disabled,
			createdAt: mailboxes.createdAt,
			hostname: domains.hostname,
			permission: mailboxAccess.permission,
		})
		.from(mailboxAccess)
		.innerJoin(mailboxes, eq(mailboxAccess.mailboxId, mailboxes.id))
		.innerJoin(domains, eq(mailboxes.domainId, domains.id))
		.where(
			and(
				eq(mailboxAccess.userId, user.id),
				eq(mailboxes.type, "shared"),
				eq(mailboxes.disabled, false),
			),
		);
	// Fork-only: shared inboxes reached through a group. The same columns as above, joined through membership.
	const groupRows = await db
		.select({
			id: mailboxes.id,
			userId: mailboxes.userId,
			domainId: mailboxes.domainId,
			localPart: mailboxes.localPart,
			displayName: mailboxes.displayName,
			signature: mailboxes.signature,
			autoReplyEnabled: mailboxes.autoReplyEnabled,
			autoReplySubject: mailboxes.autoReplySubject,
			autoReplyBody: mailboxes.autoReplyBody,
			useAllDomains: mailboxes.useAllDomains,
			avatarKey: mailboxes.avatarKey,
			type: mailboxes.type,
			disabled: mailboxes.disabled,
			createdAt: mailboxes.createdAt,
			hostname: domains.hostname,
			permission: mailboxGroupAccess.permission,
		})
		.from(mailboxGroupAccess)
		.innerJoin(groupMembers, eq(mailboxGroupAccess.groupId, groupMembers.groupId))
		.innerJoin(mailboxes, eq(mailboxGroupAccess.mailboxId, mailboxes.id))
		.innerJoin(domains, eq(mailboxes.domainId, domains.id))
		.where(
			and(
				eq(groupMembers.userId, user.id),
				eq(mailboxes.type, "shared"),
				eq(mailboxes.disabled, false),
			),
		);

	// One row per mailbox: an owned mailbox wins, otherwise the highest grant.
	const ownedIds = new Set(owned.map((mailbox) => mailbox.id));
	const sharedById = new Map<string, (typeof sharedRows)[number]>();
	for (const row of [...sharedRows, ...groupRows]) {
		if (ownedIds.has(row.id)) continue;
		const existing = sharedById.get(row.id);
		if (!existing || permissionRank[row.permission] > permissionRank[existing.permission]) sharedById.set(row.id, row);
	}
	const shared = [...sharedById.values()].map((row) => {
		const { avatarKey, ...mailbox } = row;
		return {
			...mailbox,
			hasAvatar: !!avatarKey,
			status: "active" as const,
			lastSignInAt: null,
			isPrimary: false,
		};
	});

	return [...owned, ...shared];
}

/**
 * Fork-only. Everyone given a shared inbox, directly or through a group. Owners are not included; a
 * personal mailbox has nobody.
 */
export async function listSharedMailboxUserIds(db: AppDatabase, mailboxId: string): Promise<string[]> {
	const [direct, viaGroups] = await Promise.all([
		db.select({ userId: mailboxAccess.userId }).from(mailboxAccess).where(eq(mailboxAccess.mailboxId, mailboxId)),
		db
			.select({ userId: groupMembers.userId })
			.from(mailboxGroupAccess)
			.innerJoin(groupMembers, eq(mailboxGroupAccess.groupId, groupMembers.groupId))
			.where(eq(mailboxGroupAccess.mailboxId, mailboxId)),
	]);
	return [...new Set([...direct, ...viaGroups].map((row) => row.userId))];
}

export async function listAccessibleMailboxIds(db: AppDatabase, user: Pick<SessionUser, "id" | "email" | "role">) {
	const rows = await listAccessibleMailboxes(db, user);
	return rows.map((row) => row.id);
}

function buildAccess(
	mailbox: MailboxAccessLevel["mailbox"],
	permission: MailboxPermission,
	isOwner: boolean,
): MailboxAccessLevel {
	return {
		mailbox,
		permission,
		isOwner,
		canRead: hasMailboxPermission(permission, "read_only"),
		canSendAs: hasMailboxPermission(permission, "send_as"),
		canSendOnBehalf: hasMailboxPermission(permission, "send_on_behalf"),
		canManage: hasMailboxPermission(permission, "full_access"),
	};
}
