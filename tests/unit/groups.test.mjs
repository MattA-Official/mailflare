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
	accessRoute, detail,
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
	assert.equal((await f.grant("anna", "m-support", groupId)).status, 403);

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
