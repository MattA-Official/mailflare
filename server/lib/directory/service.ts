// Fork-only: the instance directory (contacts plan, phase 2). Everyone signed in can read it. It lists people,
// groups and shared inboxes from tables that already exist, plus the optional profile fields in `user_profiles`.
//
// Instances are small, so each read loads the whole directory and filters in memory. Every read of
// `user_profiles` and `directory_settings` treats a missing table as empty, so the directory works before the
// migration is applied; writes report `needs_migration` instead. Sign-in never reads either table.
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { AppDatabase } from "#db";
import { bookingEvents, directorySettings, domains, groupMembers, groupSubgroups, groups, mailboxAliases, mailboxManagers, mailboxes, userProfiles, users } from "#db/schema";
import { isMissingTableError } from "#lib/database-errors";
import { isPersonCondition } from "#lib/accounts/kind";

export const DIRECTORY_SETTINGS_ID = "default";

export type ProfileFields = {
	title: string | null;
	department: string | null;
	phone: string | null;
	location: string | null;
	pronouns: string | null;
	about: string | null;
	reportsToUserId: string | null;
	hidden: boolean;
};

export type DirectorySettings = { selfEditOrg: boolean; orgRootUserId: string | null };

export const EMPTY_PROFILE: ProfileFields = { title: null, department: null, phone: null, location: null, pronouns: null, about: null, reportsToUserId: null, hidden: false };
const DEFAULT_SETTINGS: DirectorySettings = { selfEditOrg: true, orgRootUserId: null };

export type DirectoryPersonRecord = {
	id: string;
	name: string;
	email: string;
	addresses: string[];
	hasAvatar: boolean;
	timeZone: string | null;
	bookingUsername: string | null;
	hasBooking: boolean;
	profile: ProfileFields;
	groups: { id: string; name: string; role: "member" | "manager" }[];
};

export type DirectoryGroupRecord = {
	id: string;
	name: string;
	description: string | null;
	parentIds: string[];
	childIds: string[];
	memberIds: string[];
	managerIds: string[];
};

export type DirectoryInboxRecord = {
	id: string;
	name: string;
	address: string;
	managers: { id: string; name: string }[];
};

export type DirectorySnapshot = {
	/** False until the migration that adds `user_profiles` is applied. */
	profilesAvailable: boolean;
	settings: DirectorySettings;
	/** Everyone listed: people's enabled accounts, not hidden. */
	people: DirectoryPersonRecord[];
	/** Every person's account by id, hidden ones included, for resolving reports-to through them. */
	allProfiles: Map<string, ProfileFields>;
	groups: DirectoryGroupRecord[];
	inboxes: DirectoryInboxRecord[];
};

/** Reads every profile row; null when the table is not there yet. */
export async function loadProfiles(db: AppDatabase): Promise<Map<string, ProfileFields> | null> {
	try {
		const rows = await db.select().from(userProfiles);
		return new Map(rows.map(({ userId, updatedAt: _updatedAt, ...fields }) => [userId, fields]));
	} catch (error) {
		if (isMissingTableError(error)) return null;
		throw error;
	}
}

export async function loadDirectorySettings(db: AppDatabase): Promise<DirectorySettings & { available: boolean }> {
	try {
		const [row] = await db.select().from(directorySettings).where(eq(directorySettings.id, DIRECTORY_SETTINGS_ID)).limit(1);
		return { available: true, selfEditOrg: row?.selfEditOrg ?? DEFAULT_SETTINGS.selfEditOrg, orgRootUserId: row?.orgRootUserId ?? null };
	} catch (error) {
		if (isMissingTableError(error)) return { available: false, ...DEFAULT_SETTINGS };
		throw error;
	}
}

function address(localPart: string, hostname: string) {
	return `${localPart}@${hostname}`.toLowerCase();
}

export async function loadDirectory(db: AppDatabase): Promise<DirectorySnapshot> {
	const [accounts, profiles, settings, personalBoxes, aliases, memberships, groupRows, links, sharedBoxes, managers, bookings] = await Promise.all([
		db
			.select({ id: users.id, name: users.name, email: users.email, avatarKey: users.avatarKey, timeZone: users.timeZone, bookingUsername: users.bookingUsername })
			.from(users)
			.where(and(eq(users.disabled, false), isNull(users.deletedAt), isPersonCondition()))
			.orderBy(asc(users.name)),
		loadProfiles(db),
		loadDirectorySettings(db),
		db
			.select({ id: mailboxes.id, userId: mailboxes.userId, localPart: mailboxes.localPart, hostname: domains.hostname })
			.from(mailboxes)
			.innerJoin(domains, eq(mailboxes.domainId, domains.id))
			.where(and(eq(mailboxes.type, "personal"), eq(mailboxes.disabled, false)))
			.orderBy(asc(mailboxes.createdAt)),
		db
			.select({ mailboxId: mailboxAliases.mailboxId, localPart: mailboxAliases.localPart, hostname: domains.hostname })
			.from(mailboxAliases)
			.innerJoin(domains, eq(mailboxAliases.domainId, domains.id))
			.orderBy(asc(mailboxAliases.createdAt)),
		db.select({ groupId: groupMembers.groupId, userId: groupMembers.userId, role: groupMembers.role }).from(groupMembers),
		db.select({ id: groups.id, name: groups.name, description: groups.description }).from(groups).orderBy(asc(groups.name)),
		db.select({ parent: groupSubgroups.parentGroupId, child: groupSubgroups.childGroupId }).from(groupSubgroups),
		db
			.select({ id: mailboxes.id, displayName: mailboxes.displayName, localPart: mailboxes.localPart, hostname: domains.hostname })
			.from(mailboxes)
			.innerJoin(domains, eq(mailboxes.domainId, domains.id))
			.where(and(eq(mailboxes.type, "shared"), eq(mailboxes.disabled, false)))
			.orderBy(asc(mailboxes.localPart)),
		db.select({ mailboxId: mailboxManagers.mailboxId, groupId: mailboxManagers.groupId }).from(mailboxManagers),
		db.select({ userId: bookingEvents.userId }).from(bookingEvents).where(eq(bookingEvents.enabled, true)).groupBy(bookingEvents.userId),
	]);

	const groupNames = new Map(groupRows.map((group) => [group.id, group.name]));
	const boxesByUser = new Map<string, typeof personalBoxes>();
	for (const box of personalBoxes) boxesByUser.set(box.userId, [...(boxesByUser.get(box.userId) ?? []), box]);
	const aliasesByBox = new Map<string, string[]>();
	for (const alias of aliases) aliasesByBox.set(alias.mailboxId, [...(aliasesByBox.get(alias.mailboxId) ?? []), address(alias.localPart, alias.hostname)]);
	const groupsByUser = new Map<string, DirectoryPersonRecord["groups"]>();
	for (const row of memberships) {
		const name = groupNames.get(row.groupId);
		if (name !== undefined) groupsByUser.set(row.userId, [...(groupsByUser.get(row.userId) ?? []), { id: row.groupId, name, role: row.role }]);
	}
	const booking = new Set(bookings.map((row) => row.userId));
	const allProfiles = profiles ?? new Map<string, ProfileFields>();

	const people: DirectoryPersonRecord[] = [];
	for (const account of accounts) {
		const profile = allProfiles.get(account.id) ?? EMPTY_PROFILE;
		if (profile.hidden) continue;
		const owned = boxesByUser.get(account.id) ?? [];
		const addresses = [...new Set(owned.flatMap((box) => [address(box.localPart, box.hostname), ...(aliasesByBox.get(box.id) ?? [])]))];
		const signIn = account.email.toLowerCase();
		// The sign-in address when it is one of their mailboxes, else their first mailbox.
		const email = addresses.includes(signIn) || addresses.length === 0 ? signIn : addresses[0]!;
		people.push({
			id: account.id,
			name: account.name,
			email,
			addresses: addresses.length ? [email, ...addresses.filter((item) => item !== email)] : [email],
			hasAvatar: Boolean(account.avatarKey),
			timeZone: account.timeZone,
			bookingUsername: account.bookingUsername,
			hasBooking: Boolean(account.bookingUsername) && booking.has(account.id),
			profile,
			groups: (groupsByUser.get(account.id) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
		});
	}

	const listed = new Set(people.map((person) => person.id));
	const directoryGroups: DirectoryGroupRecord[] = groupRows.map((group) => {
		const rows = memberships.filter((row) => row.groupId === group.id && listed.has(row.userId));
		return {
			id: group.id,
			name: group.name,
			description: group.description,
			parentIds: links.filter((link) => link.child === group.id).map((link) => link.parent),
			childIds: links.filter((link) => link.parent === group.id).map((link) => link.child),
			memberIds: rows.map((row) => row.userId),
			managerIds: rows.filter((row) => row.role === "manager").map((row) => row.userId),
		};
	});

	const inboxes: DirectoryInboxRecord[] = sharedBoxes.map((box) => ({
		id: box.id,
		name: box.displayName || box.localPart,
		address: address(box.localPart, box.hostname),
		managers: managers
			.filter((row) => row.mailboxId === box.id && groupNames.has(row.groupId))
			.map((row) => ({ id: row.groupId, name: groupNames.get(row.groupId)! }))
			.sort((a, b) => a.name.localeCompare(b.name)),
	}));

	return { profilesAvailable: profiles !== null, settings: { selfEditOrg: settings.selfEditOrg, orgRootUserId: settings.orgRootUserId }, people, allProfiles, groups: directoryGroups, inboxes };
}

/** Lower-cased words a person, group or inbox can be found by. */
function matches(query: string, values: (string | null | undefined)[]) {
	if (!query) return true;
	const haystack = values.filter(Boolean).join(" ").toLowerCase();
	return query.toLowerCase().split(/\s+/).filter(Boolean).every((word) => haystack.includes(word));
}

export function searchPeople(snapshot: DirectorySnapshot, query: string) {
	return snapshot.people.filter((person) => matches(query, [person.name, ...person.addresses, person.profile.title, person.profile.department, person.profile.location]));
}

export function searchGroups(snapshot: DirectorySnapshot, query: string) {
	return snapshot.groups.filter((group) => matches(query, [group.name, group.description]));
}

export function searchInboxes(snapshot: DirectorySnapshot, query: string) {
	return snapshot.inboxes.filter((inbox) => matches(query, [inbox.name, inbox.address]));
}

/**
 * Each listed person's manager as drawn: their reports-to, skipping managers who are hidden, disabled or deleted
 * (their reports move up to the next visible manager). A chain that loops back is cut where it repeats.
 */
export function visibleManagers(snapshot: DirectorySnapshot): Map<string, string | null> {
	const listed = new Set(snapshot.people.map((person) => person.id));
	const result = new Map<string, string | null>();
	for (const person of snapshot.people) {
		const seen = new Set<string>([person.id]);
		let next = snapshot.allProfiles.get(person.id)?.reportsToUserId ?? null;
		while (next && !listed.has(next) && !seen.has(next)) {
			seen.add(next);
			next = snapshot.allProfiles.get(next)?.reportsToUserId ?? null;
		}
		result.set(person.id, next && listed.has(next) && !seen.has(next) ? next : null);
	}
	return result;
}

/**
 * Whether making `managerId` the manager of `personId` would close a loop: true when `personId` is
 * `managerId` or anywhere above them. Reads the stored reports-to of every account, hidden ones included.
 */
export function wouldLoop(profiles: Map<string, ProfileFields>, personId: string, managerId: string): boolean {
	const seen = new Set<string>();
	for (let current: string | null = managerId; current; current = profiles.get(current)?.reportsToUserId ?? null) {
		if (current === personId) return true;
		if (seen.has(current)) return false;
		seen.add(current);
	}
	return false;
}

export function personSummary(person: DirectoryPersonRecord) {
	return {
		id: person.id,
		name: person.name,
		email: person.email,
		title: person.profile.title,
		department: person.profile.department,
		hasAvatar: person.hasAvatar,
	};
}

export function personDetail(snapshot: DirectorySnapshot, person: DirectoryPersonRecord) {
	const byId = new Map(snapshot.people.map((item) => [item.id, item]));
	const managers = visibleManagers(snapshot);
	const chain: ReturnType<typeof personSummary>[] = [];
	const seen = new Set<string>([person.id]);
	for (let next = managers.get(person.id) ?? null; next && !seen.has(next); next = managers.get(next) ?? null) {
		seen.add(next);
		chain.push(personSummary(byId.get(next)!));
	}
	const reports = snapshot.people.filter((item) => managers.get(item.id) === person.id).map(personSummary);
	return {
		...personSummary(person),
		addresses: person.addresses,
		phone: person.profile.phone,
		location: person.profile.location,
		pronouns: person.profile.pronouns,
		about: person.profile.about,
		timeZone: person.timeZone,
		bookingUrl: person.hasBooking ? `/c/${encodeURIComponent(person.bookingUsername!)}` : null,
		groups: person.groups,
		/** Their manager first, then that manager's manager, up to the top. */
		reportsTo: chain,
		directReports: reports,
	};
}

export function groupDetail(snapshot: DirectorySnapshot, group: DirectoryGroupRecord) {
	const byId = new Map(snapshot.people.map((item) => [item.id, item]));
	const groupsById = new Map(snapshot.groups.map((item) => [item.id, item]));
	const link = (id: string) => {
		const found = groupsById.get(id);
		return found ? { id, name: found.name, memberCount: found.memberIds.length } : null;
	};
	const managerIds = new Set(group.managerIds);
	return {
		id: group.id,
		name: group.name,
		description: group.description,
		members: group.memberIds.map((id) => ({ ...personSummary(byId.get(id)!), role: managerIds.has(id) ? "manager" as const : "member" as const }))
			.sort((a, b) => Number(b.role === "manager") - Number(a.role === "manager") || a.name.localeCompare(b.name)),
		parents: group.parentIds.map(link).filter((item) => item !== null).sort((a, b) => a.name.localeCompare(b.name)),
		subgroups: group.childIds.map(link).filter((item) => item !== null).sort((a, b) => a.name.localeCompare(b.name)),
		inboxes: snapshot.inboxes.filter((inbox) => inbox.managers.some((manager) => manager.id === group.id)).map(({ id, name, address }) => ({ id, name, address })),
	};
}

/** Every department in use, for the filter. */
export function departments(snapshot: DirectorySnapshot): string[] {
	return [...new Set(snapshot.people.map((person) => person.profile.department?.trim()).filter((value): value is string => Boolean(value)))]
		.sort((a, b) => a.localeCompare(b));
}

/** The reporting-lines and teams data the org chart draws. */
export function orgChart(snapshot: DirectorySnapshot) {
	const managers = visibleManagers(snapshot);
	const listed = new Set(snapshot.people.map((person) => person.id));
	const root = snapshot.settings.orgRootUserId && listed.has(snapshot.settings.orgRootUserId) ? snapshot.settings.orgRootUserId : null;
	return {
		rootId: root,
		people: snapshot.people.map((person) => ({ ...personSummary(person), managerId: managers.get(person.id) ?? null })),
		groups: snapshot.groups.map(({ id, name, description, parentIds, memberIds, managerIds }) => ({ id, name, description, parentIds, memberIds, managerIds })),
	};
}

export class DirectoryNeedsMigrationError extends Error {
	constructor() {
		super("needs_migration");
	}
}

/** Writes a person's profile fields. Throws DirectoryNeedsMigrationError when the table is not there yet. */
export async function saveProfile(db: AppDatabase, userId: string, fields: Partial<ProfileFields>): Promise<void> {
	const values = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as Partial<ProfileFields>;
	try {
		await db
			.insert(userProfiles)
			.values({ userId, ...values, updatedAt: new Date() })
			.onConflictDoUpdate({ target: userProfiles.userId, set: { ...values, updatedAt: new Date() } });
	} catch (error) {
		if (isMissingTableError(error)) throw new DirectoryNeedsMigrationError();
		throw error;
	}
}

export async function saveDirectorySettings(db: AppDatabase, input: Partial<DirectorySettings>): Promise<void> {
	const values = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Partial<DirectorySettings>;
	try {
		await db
			.insert(directorySettings)
			.values({ id: DIRECTORY_SETTINGS_ID, ...values, updatedAt: new Date() })
			.onConflictDoUpdate({ target: directorySettings.id, set: { ...values, updatedAt: new Date() } });
	} catch (error) {
		if (isMissingTableError(error)) throw new DirectoryNeedsMigrationError();
		throw error;
	}
}

/** Whether an account id is a person who can be someone's manager: enabled, not deleted, a person. */
export async function isAssignableManager(db: AppDatabase, id: string): Promise<boolean> {
	const [row] = await db
		.select({ id: users.id })
		.from(users)
		.where(and(eq(users.id, id), eq(users.disabled, false), isNull(users.deletedAt), isPersonCondition()))
		.limit(1);
	return Boolean(row);
}

/** Avatar key of a listed person, for the directory photo. */
export async function directoryAvatarKey(db: AppDatabase, id: string): Promise<string | null> {
	const [row] = await db
		.select({ avatarKey: users.avatarKey })
		.from(users)
		.where(and(eq(users.id, id), eq(users.disabled, false), isNull(users.deletedAt), sql`${isPersonCondition()}`))
		.limit(1);
	return row?.avatarKey ?? null;
}
