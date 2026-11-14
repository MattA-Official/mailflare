// Fork-only: groups of accounts and shared inboxes granted to a group (migration 0089_groups).
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterAll as after, test, onTestFinished } from "vitest";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "./helpers/esbuild.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const directory = mkdtempSync(join(root, "node_modules", "groups-test-"));
after(() => rmSync(directory, { recursive: true, force: true }));
await build({
	stdin: {
		contents: `
			export { SqliteDatabase } from "./tests/unit/helpers/sqlite-database.mjs";
			export { applyMigrations } from "./tests/unit/helpers/migrate.mjs";
			export { getDb } from "./server/db/index.ts";
			export { createSession } from "./server/lib/auth/session.ts";
			export { getMailboxAccessLevel, listAccessibleMailboxes, listSharedMailboxUserIds } from "./server/lib/mailboxes/access.ts";
			export { getMailboxNotificationUserIds } from "./server/lib/realtime/utils.ts";
			export * as groupsRoute from "./server/handlers/api/groups/route.ts";
			export * as groupRoute from "./server/handlers/api/groups/[id]/route.ts";
			export * as membersRoute from "./server/handlers/api/groups/[id]/members/route.ts";
			export * as groupAccessRoute from "./server/handlers/api/mailboxes/[id]/group-access/route.ts";
			export * as accessRoute from "./server/handlers/api/mailboxes/[id]/access/route.ts";
			export * as detail from "./server/handlers/api/mailboxes/[id]/route.ts";
			export * as mineRoute from "./server/handlers/api/groups/mine/route.ts";
			export * as summaryRoute from "./server/handlers/api/mailboxes/[id]/access-summary/route.ts";
			export * as driveSharesRoute from "./server/handlers/api/drive/items/[id]/shares/route.ts";
			export * as driveItemsRoute from "./server/handlers/api/drive/items/route.ts";
			export { getDriveRole, getDriveItem } from "./server/lib/drive/access.ts";
			export * as managersRoute from "./server/handlers/api/mailboxes/[id]/managers/route.ts";
			export { deleteAccounts } from "./server/lib/accounts/deletion.ts";
			export * as subgroupsRoute from "./server/handlers/api/groups/[id]/subgroups/route.ts";
		`,
		resolveDir: root,
		sourcefile: "groups-test-entry.ts",
	},
	outfile: join(directory, "entry.mjs"),
	bundle: true,
	platform: "node",
	format: "esm",
	target: "node24",
	packages: "external",
	alias: { "cloudflare:workers": "./tests/unit/helpers/cloudflare-workers.mjs" },
	logLevel: "silent",
});
const {
	SqliteDatabase, applyMigrations, getDb, createSession, getMailboxAccessLevel, listAccessibleMailboxes,
	listSharedMailboxUserIds, getMailboxNotificationUserIds, groupsRoute, groupRoute, membersRoute, groupAccessRoute,
	accessRoute, detail, mineRoute, summaryRoute, driveSharesRoute, driveItemsRoute, getDriveRole, getDriveItem,
	managersRoute, deleteAccounts, subgroupsRoute,
} = await import(pathToFileURL(join(directory, "entry.mjs")).href);
const context = id => ({ params: Promise.resolve({ id }) });

async function fixture() {
	const database = new SqliteDatabase(":memory:");
	onTestFinished(() => database.db.close());
	await applyMigrations(database, join(root, "server/db/migrations/sqlite"));
	const sql = database.db;
	const addUser = sql.prepare(`INSERT INTO users
		(id, email, password_hash, name, role, is_primary_admin, can_manage_users, can_manage_mailboxes, created_by_user_id, disabled, created_at)
		VALUES (?, ?, 'hash', ?, ?, ?, ?, ?, ?, ?, 1)`);
	for (const row of [
		["primary", "owner@one.test", "Owner", "admin", 1, 0, 0, null, 0],
		["users-admin", "users@one.test", "Users admin", "admin", 0, 1, 0, "primary", 0],
		["mailbox-admin", "boxes@one.test", "Mailbox admin", "admin", 0, 0, 1, "primary", 0],
		["plain-admin", "plain@one.test", "Plain admin", "admin", 0, 0, 0, "primary", 0],
		["anna", "anna@one.test", "Anna", "user", 0, 0, 0, "users-admin", 0],
		["ben", "ben@one.test", "Ben", "user", 0, 0, 0, "primary", 0],
		["off", "off@one.test", "Disabled", "user", 0, 0, 0, "primary", 1],
	]) addUser.run(...row);
	sql.exec(`
		INSERT INTO domains (id, user_id, hostname, zone_id, status, created_at) VALUES ('one', 'primary', 'one.test', 'zone-one', 'active', 1);
		INSERT INTO mailboxes (id, user_id, domain_id, local_part, display_name, type, use_all_domains, disabled, created_at) VALUES
			('m-support', 'primary', 'one', 'support', 'Support', 'shared', 0, 0, 1),
			('m-billing', 'primary', 'one', 'billing', 'Billing', 'shared', 0, 0, 1),
			('m-anna', 'anna', 'one', 'anna', 'Anna', 'personal', 0, 0, 1);
	`);
	const env = { DB: database, MAILFLARE_RUNTIME: "node", CF_TOKEN: "test-only" };
	globalThis.__mailflareNodeEnv = env;
	onTestFinished(() => { delete globalThis.__mailflareNodeEnv; });
	const sessions = new Map();
	for (const id of ["primary", "users-admin", "mailbox-admin", "plain-admin", "anna", "ben"]) {
		sessions.set(id, await createSession(env, id));
	}
	const request = (actor, path, method = "GET", body) => new Request(`https://mail.test${path}`, {
		method,
		headers: { Authorization: `Bearer ${sessions.get(actor)}`, Origin: "https://mail.test", "Content-Type": "application/json" },
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
	const createGroup = async (actor, name) => groupsRoute.POST(request(actor, "/api/groups", "POST", { name }));
	const addMember = (actor, groupId, userId) => membersRoute.POST(request(actor, `/api/groups/${groupId}/members`, "POST", { userId }), context(groupId));
	const grant = (actor, mailboxId, groupId, permission = "full_access") =>
		groupAccessRoute.POST(request(actor, `/api/mailboxes/${mailboxId}/group-access`, "POST", { groupId, permission }), context(mailboxId));
	return { sql, env, db: getDb(env), request, createGroup, addMember, grant };
}

async function supportGroup(f) {
	const created = await f.createGroup("primary", "Support");
	assert.equal(created.status, 201);
	const { group } = await created.json();
	assert.equal((await f.addMember("primary", group.id, "anna")).status, 200);
	assert.equal((await f.addMember("primary", group.id, "ben")).status, 200);
	return group.id;
}

test("members of a group reach the shared inboxes granted to it, and lose them when removed", async () => {
	const f = await fixture();
	const groupId = await supportGroup(f);
	assert.equal(await getMailboxAccessLevel(f.db, { id: "anna", role: "user" }, "m-support"), null);

	assert.equal((await f.grant("primary", "m-support", groupId, "read_only")).status, 200);
	const access = await getMailboxAccessLevel(f.db, { id: "anna", role: "user" }, "m-support");
	assert.equal(access.permission, "read_only");
	assert.equal(access.canRead, true);
	assert.equal(access.canSendAs, false);
	const listed = await listAccessibleMailboxes(f.db, { id: "anna", email: "anna@one.test", role: "user" });
	assert.deepEqual(listed.map(row => row.id).sort(), ["m-anna", "m-support"]);

	const removed = await membersRoute.DELETE(f.request("primary", `/api/groups/${groupId}/members?userId=anna`, "DELETE"), context(groupId));
	assert.equal(removed.status, 200);
	assert.equal(await getMailboxAccessLevel(f.db, { id: "anna", role: "user" }, "m-support"), null);
	assert.equal((await getMailboxAccessLevel(f.db, { id: "ben", role: "user" }, "m-support")).permission, "read_only");
});

test("the highest of a direct grant and group grants wins, and each inbox is listed once", async () => {
	const f = await fixture();
	const groupId = await supportGroup(f);
	const other = await (await f.createGroup("primary", "Everyone")).json();
	await f.addMember("primary", other.group.id, "anna");
	await f.grant("primary", "m-support", groupId, "send_on_behalf");
	await f.grant("primary", "m-support", other.group.id, "send_as");
	f.sql.exec("INSERT INTO mailbox_access (id, mailbox_id, user_id, permission, created_at) VALUES ('direct', 'm-support', 'anna', 'read_only', 1)");

	assert.equal((await getMailboxAccessLevel(f.db, { id: "anna", role: "user" }, "m-support")).permission, "send_as");
	const listed = await listAccessibleMailboxes(f.db, { id: "anna", email: "anna@one.test", role: "user" });
	const support = listed.filter(row => row.id === "m-support");
	assert.equal(support.length, 1);
	assert.equal(support[0].permission, "send_as");

	f.sql.exec("UPDATE mailbox_access SET permission = 'full_access' WHERE id = 'direct'");
	assert.equal((await getMailboxAccessLevel(f.db, { id: "anna", role: "user" }, "m-support")).permission, "full_access");
});

test("group grants never open personal mailboxes", async () => {
	const f = await fixture();
	const groupId = await supportGroup(f);
	f.sql.exec(`INSERT INTO mailbox_group_access (id, mailbox_id, group_id, permission, created_at) VALUES ('stray', 'm-anna', '${groupId}', 'full_access', 1)`);
	assert.equal(await getMailboxAccessLevel(f.db, { id: "ben", role: "user" }, "m-anna"), null);
	const listed = await listAccessibleMailboxes(f.db, { id: "ben", email: "ben@one.test", role: "user" });
	assert.deepEqual(listed.map(row => row.id), []);
	assert.equal((await f.grant("primary", "m-anna", groupId)).status, 404);
});

test("live updates reach group members, and deleting the group removes their access", async () => {
	const f = await fixture();
	const groupId = await supportGroup(f);
	await f.grant("primary", "m-support", groupId);
	assert.deepEqual((await listSharedMailboxUserIds(f.db, "m-support")).sort(), ["anna", "ben"]);
	assert.deepEqual((await getMailboxNotificationUserIds(f.env, "m-support", "primary")).sort(), ["anna", "ben", "primary"]);

	assert.equal((await groupRoute.DELETE(f.request("primary", `/api/groups/${groupId}`, "DELETE"), context(groupId))).status, 200);
	assert.deepEqual(await listSharedMailboxUserIds(f.db, "m-support"), []);
	assert.equal(f.sql.prepare("SELECT count(*) AS total FROM mailbox_group_access").get().total, 0);
	assert.equal(f.sql.prepare("SELECT count(*) AS total FROM group_members").get().total, 0);
});

test("only account managers create and edit groups; any admin can read them", async () => {
	const f = await fixture();
	assert.equal((await f.createGroup("users-admin", "Ops")).status, 201);
	for (const actor of ["mailbox-admin", "plain-admin", "anna"]) {
		assert.equal((await f.createGroup(actor, "Denied")).status, 403);
	}
	assert.equal((await f.createGroup("primary", "ops")).status, 409, "names are unique regardless of case");
	const { groups } = await (await groupsRoute.GET(f.request("plain-admin", "/api/groups"))).json();
	assert.deepEqual(groups.map(group => group.name), ["Ops"]);
	assert.equal((await groupsRoute.GET(f.request("anna", "/api/groups"))).status, 403);

	const groupId = groups[0].id;
	assert.equal((await f.addMember("mailbox-admin", groupId, "anna")).status, 403);
	assert.equal((await f.addMember("users-admin", groupId, "off")).status, 404, "disabled accounts cannot join");
	const renamed = await groupRoute.PATCH(f.request("users-admin", `/api/groups/${groupId}`, "PATCH", { name: "Operations" }), context(groupId));
	assert.equal(renamed.status, 200);
	assert.equal((await renamed.json()).group.name, "Operations");
});

test("admins trusted with mailboxes or accounts manage a shared inbox's access, not just its owner", async () => {
	const f = await fixture();
	const groupId = await supportGroup(f);
	for (const actor of ["primary", "users-admin", "mailbox-admin"]) {
		assert.equal((await f.grant(actor, "m-support", groupId)).status, 200, actor);
		const response = await detail.GET(f.request(actor, "/api/mailboxes/m-support"), context("m-support"));
		assert.equal(response.status, 200, actor);
		assert.equal((await response.json()).mailbox.canManageSharing, true, actor);
	}
	assert.equal((await f.grant("plain-admin", "m-support", groupId)).status, 404);
	// Anna is not an admin, but the grant above gave her full access, which now lets her manage who has it.
	assert.equal((await f.grant("anna", "m-support", groupId)).status, 200);
	assert.equal((await f.grant("ben", "m-billing", groupId)).status, 404);

	const listed = await (await groupAccessRoute.GET(f.request("mailbox-admin", "/api/mailboxes/m-support/group-access"), context("m-support"))).json();
	assert.deepEqual(listed.groups.map(group => [group.groupName, group.permission, group.memberCount]), [["Support", "full_access", 2]]);
	const revoked = await groupAccessRoute.DELETE(f.request("mailbox-admin", `/api/mailboxes/m-support/group-access?groupId=${groupId}`, "DELETE"), context("m-support"));
	assert.equal(revoked.status, 200);
	assert.equal(await getMailboxAccessLevel(f.db, { id: "anna", role: "user" }, "m-support"), null);
});

test("every enabled account except the owner can be given a shared inbox, whoever created it", async () => {
	const f = await fixture();
	const response = await accessRoute.GET(f.request("mailbox-admin", "/api/mailboxes/m-support/access"), context("m-support"));
	assert.equal(response.status, 200);
	const { availableUsers } = await response.json();
	assert.deepEqual(availableUsers.map(user => user.id).sort(), ["anna", "ben", "mailbox-admin", "plain-admin", "users-admin"]);
	const granted = await accessRoute.POST(f.request("mailbox-admin", "/api/mailboxes/m-support/access", "POST", { userId: "anna", permission: "read_only" }), context("m-support"));
	assert.equal(granted.status, 200);
	const disabled = await accessRoute.POST(f.request("primary", "/api/mailboxes/m-support/access", "POST", { userId: "off", permission: "read_only" }), context("m-support"));
	assert.equal(disabled.status, 404);
});

// Phase 2: group managers, Settings -> Groups, who has access, and Drive.

test("a group's managers add and remove ordinary members; only account managers choose managers", async () => {
	const f = await fixture();
	const groupId = await supportGroup(f);
	const promote = (actor, userId, role) => membersRoute.PATCH(f.request(actor, `/api/groups/${groupId}/members`, "PATCH", { userId, role }), context(groupId));
	assert.equal((await promote("anna", "anna", "manager")).status, 403);
	assert.equal((await promote("primary", "anna", "manager")).status, 200);

	const candidates = await (await membersRoute.GET(f.request("anna", `/api/groups/${groupId}/members`), context(groupId))).json();
	assert.ok(candidates.candidates.some(account => account.id === "plain-admin"));
	assert.ok(!candidates.candidates.some(account => ["anna", "ben", "off"].includes(account.id)));

	assert.equal((await f.addMember("anna", groupId, "plain-admin")).status, 200);
	const asManager = await membersRoute.POST(f.request("anna", `/api/groups/${groupId}/members`, "POST", { userId: "mailbox-admin", role: "manager" }), context(groupId));
	assert.equal(asManager.status, 403, "managers cannot make managers");
	const removeBen = await membersRoute.DELETE(f.request("anna", `/api/groups/${groupId}/members?userId=ben`, "DELETE"), context(groupId));
	assert.equal(removeBen.status, 200);
	await promote("primary", "plain-admin", "manager");
	const removeManager = await membersRoute.DELETE(f.request("anna", `/api/groups/${groupId}/members?userId=plain-admin`, "DELETE"), context(groupId));
	assert.equal(removeManager.status, 403);

	// Ordinary members cannot change membership, rename or delete.
	await f.addMember("primary", groupId, "ben");
	assert.equal((await f.addMember("ben", groupId, "mailbox-admin")).status, 403);
	assert.equal((await groupRoute.PATCH(f.request("anna", `/api/groups/${groupId}`, "PATCH", { name: "Renamed" }), context(groupId))).status, 403);
	assert.equal((await groupRoute.DELETE(f.request("anna", `/api/groups/${groupId}`, "DELETE"), context(groupId))).status, 403);
});

test("members can read their own groups, and nobody else's", async () => {
	const f = await fixture();
	const groupId = await supportGroup(f);
	const other = (await (await f.createGroup("primary", "Finance")).json()).group.id;
	await f.grant("primary", "m-support", groupId);

	const mine = await (await mineRoute.GET(f.request("ben", "/api/groups/mine"))).json();
	assert.deepEqual(mine.groups.map(group => [group.name, group.role, group.memberCount, group.mailboxCount]), [["Support", "member", 2, 1]]);
	const read = await groupRoute.GET(f.request("ben", `/api/groups/${groupId}`), context(groupId));
	assert.equal(read.status, 200);
	const body = await read.json();
	assert.equal(body.canManage, false);
	assert.equal(body.canManageMembers, false);
	assert.equal(body.myRole, "member");
	assert.equal((await groupRoute.GET(f.request("ben", `/api/groups/${other}`), context(other))).status, 403);
});

test("who has access lists each person once with every route in", async () => {
	const f = await fixture();
	const groupId = await supportGroup(f);
	await f.grant("primary", "m-support", groupId, "send_on_behalf");
	f.sql.exec("INSERT INTO mailbox_access (id, mailbox_id, user_id, permission, created_at) VALUES ('direct', 'm-support', 'anna', 'full_access', 1)");
	const response = await summaryRoute.GET(f.request("mailbox-admin", "/api/mailboxes/m-support/access-summary"), context("m-support"));
	assert.equal(response.status, 200);
	const { people } = await response.json();
	const byId = Object.fromEntries(people.map(person => [person.userId, person]));
	assert.deepEqual(Object.keys(byId).sort(), ["anna", "ben", "primary"]);
	assert.equal(byId.anna.permission, "full_access");
	assert.deepEqual(byId.anna.routes.map(route => route.kind).sort(), ["direct", "group"]);
	assert.equal(byId.ben.permission, "send_on_behalf");
	assert.equal(byId.ben.routes[0].groupName, "Support");
	assert.equal(byId.primary.routes[0].kind, "owner");
	assert.equal((await summaryRoute.GET(f.request("plain-admin", "/api/mailboxes/m-support/access-summary"), context("m-support"))).status, 404);
});

test("Drive items shared with a group reach its members, at the highest role", async () => {
	const f = await fixture();
	const groupId = await supportGroup(f);
	f.sql.exec(`INSERT INTO drive_items (id, owner_id, parent_id, kind, name, created_at, updated_at) VALUES
		('folder', 'anna', NULL, 'folder', 'Rota', 1, 1),
		('file', 'anna', 'folder', 'file', 'week.pdf', 1, 1)`);
	const share = (actor, body) => driveSharesRoute.POST(f.request(actor, "/api/drive/items/folder/shares", "POST", body), context("folder"));
	const listed = await (await driveSharesRoute.GET(f.request("anna", "/api/drive/items/folder/shares"), context("folder"))).json();
	assert.deepEqual(listed.availableGroups.map(group => group.name), ["Support"]);
	const other = (await (await f.createGroup("primary", "Finance")).json()).group.id;
	assert.equal((await share("anna", { groupId: other })).status, 404, "people share only with groups they belong to");

	const shared = await share("anna", { groupId, role: "view" });
	assert.equal(shared.status, 200);
	assert.deepEqual((await shared.json()).groupShares.map(row => [row.name, row.role]), [["Support", "view"]]);
	const file = await getDriveItem(f.db, "file");
	assert.equal(await getDriveRole(f.db, "ben", file), "view");
	assert.equal(await getDriveRole(f.db, "plain-admin", file), null);

	f.sql.exec("INSERT INTO drive_shares (id, item_id, user_id, role, created_at) VALUES ('direct', 'folder', 'ben', 'edit', 1)");
	assert.equal(await getDriveRole(f.db, "ben", file), "edit");
	const sharedView = await (await driveItemsRoute.GET(f.request("ben", "/api/drive/items?view=shared"))).json();
	assert.deepEqual(sharedView.items.map(item => [item.id, item.role]), [["folder", "edit"]]);

	const groupShareId = (await (await driveSharesRoute.GET(f.request("anna", "/api/drive/items/folder/shares"), context("folder"))).json()).groupShares[0].id;
	await driveSharesRoute.DELETE(f.request("anna", `/api/drive/items/folder/shares?groupShareId=${groupShareId}`, "DELETE"), context("folder"));
	f.sql.exec("DELETE FROM drive_shares");
	assert.equal(await getDriveRole(f.db, "ben", file), null);
});

test("groups that manage a shared inbox keep full access, and their members can manage who has it", async () => {
	const f = await fixture();
	const groupId = await supportGroup(f);
	const other = (await (await f.createGroup("primary", "Billing")).json()).group.id;
	const manage = (actor, mailboxId, body) =>
		managersRoute.POST(f.request(actor, `/api/mailboxes/${mailboxId}/managers`, "POST", body), context(mailboxId));

	assert.equal((await manage("plain-admin", "m-support", { groupId })).status, 404);
	assert.equal((await manage("primary", "m-anna", { groupId })).status, 404);
	assert.equal((await manage("mailbox-admin", "m-support", { groupId })).status, 200);
	assert.equal((await manage("primary", "m-support", { groupId: other })).status, 200);
	assert.equal((await getMailboxAccessLevel(f.db, { id: "anna", role: "user" }, "m-support")).permission, "full_access");

	const state = await (await groupAccessRoute.GET(f.request("primary", "/api/mailboxes/m-support/group-access"), context("m-support"))).json();
	assert.deepEqual([...state.managerGroupIds].sort(), [groupId, other].sort());
	// A managing group cannot be downgraded or removed while it manages the inbox.
	assert.equal((await f.grant("primary", "m-support", groupId, "read_only")).status, 409);
	const removeGrant = await groupAccessRoute.DELETE(f.request("primary", `/api/mailboxes/m-support/group-access?groupId=${groupId}`, "DELETE"), context("m-support"));
	assert.equal(removeGrant.status, 409);

	const summary = await (await summaryRoute.GET(f.request("primary", "/api/mailboxes/m-support/access-summary"), context("m-support"))).json();
	const anna = summary.people.find(person => person.userId === "anna");
	assert.deepEqual(anna.routes, [{ kind: "group", permission: "full_access", groupId, groupName: "Support", managesInbox: true }]);
	const detailBody = await (await groupRoute.GET(f.request("primary", `/api/groups/${groupId}`), context(groupId))).json();
	assert.deepEqual(detailBody.group.mailboxes.map(mailbox => [mailbox.id, mailbox.managed]), [["m-support", true]]);

	// Anna is not an admin, but full access through a managing group lets her decide who else has it.
	assert.equal((await accessRoute.POST(f.request("anna", "/api/mailboxes/m-support/access", "POST", { userId: "users-admin", permission: "read_only" }), context("m-support"))).status, 200);
	assert.equal((await getMailboxAccessLevel(f.db, { id: "users-admin", role: "admin" }, "m-support")).permission, "read_only");
	assert.equal((await (await detail.GET(f.request("anna", "/api/mailboxes/m-support"), context("m-support"))).json()).mailbox.canManageSharing, true);
	// Read-only access does not.
	f.sql.exec("INSERT INTO mailbox_access (id, mailbox_id, user_id, permission, created_at) VALUES ('ro', 'm-billing', 'anna', 'read_only', 1)");
	assert.equal((await accessRoute.GET(f.request("anna", "/api/mailboxes/m-billing/access"), context("m-billing"))).status, 404);

	// Stopping a group managing keeps its grant, which can then be removed as usual.
	const cleared = await managersRoute.DELETE(f.request("primary", `/api/mailboxes/m-support/managers?groupId=${groupId}`, "DELETE"), context("m-support"));
	assert.equal(cleared.status, 200);
	assert.equal((await getMailboxAccessLevel(f.db, { id: "ben", role: "user" }, "m-support")).permission, "full_access");
	const removed = await groupAccessRoute.DELETE(f.request("primary", `/api/mailboxes/m-support/group-access?groupId=${groupId}`, "DELETE"), context("m-support"));
	assert.equal(removed.status, 200);
	assert.equal(await getMailboxAccessLevel(f.db, { id: "ben", role: "user" }, "m-support"), null);
});

test("sub-groups get what their parents are given, parents get nothing from sub-groups, and loops are refused", async () => {
	const f = await fixture();
	const create = async (name) => (await (await f.createGroup("primary", name)).json()).group.id;
	const support = await create("Support");
	const sales = await create("Sales");
	const tier1 = await create("Tier 1");
	const nights = await create("Nights");
	const nest = (actor, parent, child) => subgroupsRoute.POST(f.request(actor, `/api/groups/${parent}/subgroups`, "POST", { groupId: child }), context(parent));
	const unnest = (parent, child) => subgroupsRoute.DELETE(f.request("primary", `/api/groups/${parent}/subgroups?groupId=${child}`, "DELETE"), context(parent));
	assert.equal((await nest("plain-admin", support, tier1)).status, 403);
	assert.equal((await nest("primary", support, tier1)).status, 200);
	assert.equal((await nest("primary", tier1, nights)).status, 200);
	// A group can sit inside several groups.
	assert.equal((await nest("primary", sales, nights)).status, 200);
	assert.equal((await f.addMember("primary", support, "anna")).status, 200);
	assert.equal((await f.addMember("primary", nights, "ben")).status, 200);

	// Down two levels: Ben, in Nights, reaches what Support is given.
	assert.equal((await f.grant("primary", "m-support", support, "send_as")).status, 200);
	assert.equal((await getMailboxAccessLevel(f.db, { id: "ben", role: "user" }, "m-support")).permission, "send_as");
	const bensInboxes = await listAccessibleMailboxes(f.db, { id: "ben", email: "ben@one.test", role: "user" });
	assert.deepEqual(bensInboxes.map(row => [row.id, row.permission]), [["m-support", "send_as"]]);
	assert.deepEqual((await listSharedMailboxUserIds(f.db, "m-support")).sort(), ["anna", "ben"]);
	// Not up: Anna, in Support, gets nothing from a grant to Tier 1.
	assert.equal((await f.grant("primary", "m-billing", tier1, "read_only")).status, 200);
	assert.equal(await getMailboxAccessLevel(f.db, { id: "anna", role: "user" }, "m-billing"), null);
	assert.equal((await getMailboxAccessLevel(f.db, { id: "ben", role: "user" }, "m-billing")).permission, "read_only");

	const summary = await (await summaryRoute.GET(f.request("primary", "/api/mailboxes/m-support/access-summary"), context("m-support"))).json();
	const ben = summary.people.find(person => person.userId === "ben");
	assert.deepEqual(ben.routes, [{ kind: "group", permission: "send_as", groupId: support, groupName: "Support", managesInbox: false, memberGroupId: nights, memberGroupName: "Nights" }]);

	const detail = await (await groupRoute.GET(f.request("primary", `/api/groups/${nights}`), context(nights))).json();
	assert.deepEqual(detail.group.parents.map(group => group.name), ["Sales", "Tier 1"]);
	assert.deepEqual(detail.group.mailboxes.map(mailbox => [mailbox.id, mailbox.inheritedFrom?.name]), [["m-billing", "Tier 1"], ["m-support", "Support"]]);
	const top = await (await groupRoute.GET(f.request("primary", `/api/groups/${support}`), context(support))).json();
	assert.deepEqual(top.group.subgroups.map(group => group.name), ["Tier 1"]);
	// Nights is already beneath Support, and Support can't go inside anything beneath it.
	assert.deepEqual(top.group.subgroupOptions.map(group => group.name), ["Sales"]);

	// Drive follows the same rule.
	f.sql.exec(`INSERT INTO drive_items (id, owner_id, parent_id, kind, name, created_at, updated_at) VALUES ('rota', 'primary', NULL, 'folder', 'Rota', 1, 1)`);
	f.sql.exec(`INSERT INTO drive_group_shares (id, item_id, group_id, role, created_at) VALUES ('dgs', 'rota', '${support}', 'edit', 1)`);
	assert.equal(await getDriveRole(f.db, "ben", await getDriveItem(f.db, "rota")), "edit");

	// No loops, at any depth.
	assert.equal((await nest("primary", nights, support)).status, 400);
	assert.equal((await nest("primary", tier1, tier1)).status, 400);

	// Taking Nights out of Tier 1 ends what came through it; its other parent still counts.
	assert.equal((await f.grant("primary", "m-support", sales, "read_only")).status, 200);
	assert.equal((await unnest(tier1, nights)).status, 200);
	assert.equal((await getMailboxAccessLevel(f.db, { id: "ben", role: "user" }, "m-support")).permission, "read_only");
	assert.equal(await getMailboxAccessLevel(f.db, { id: "ben", role: "user" }, "m-billing"), null);

	// Deleting a parent works the same way: its links go, the sub-groups stay.
	assert.equal((await groupRoute.DELETE(f.request("primary", `/api/groups/${sales}`, "DELETE"), context(sales))).status, 200);
	assert.equal(await getMailboxAccessLevel(f.db, { id: "ben", role: "user" }, "m-support"), null);
	assert.ok(f.sql.prepare("SELECT id FROM groups WHERE id = ?").get(nights));
	assert.equal(f.sql.prepare("SELECT COUNT(*) AS total FROM group_subgroups").get().total, 1);
});
