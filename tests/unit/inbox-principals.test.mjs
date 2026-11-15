// Fork-only: shared inboxes held by their own hidden account (migration 0093_inbox_principals).
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterAll as after, test, onTestFinished } from "vitest";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "./helpers/esbuild.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const migrations = join(root, "server/db/migrations/sqlite");
const directory = mkdtempSync(join(root, "node_modules", "inbox-principals-test-"));
after(() => rmSync(directory, { recursive: true, force: true }));
await build({
	stdin: {
		contents: `
			export { SqliteDatabase } from "./tests/unit/helpers/sqlite-database.mjs";
			export { applyMigrations } from "./tests/unit/helpers/migrate.mjs";
			export { getDb } from "./server/db/index.ts";
			export { createSession } from "./server/lib/auth/session.ts";
			export { getMailboxAccessLevel, listAccessibleMailboxes } from "./server/lib/mailboxes/access.ts";
			export { createInboxPrincipal, grantCreatorFullAccess, inboxPrincipalId } from "./server/lib/mailboxes/principals.ts";
			export { listAccountsForAdmin, countUsedAccountSeats } from "./server/handlers/api/accounts/utils.ts";
			export { selectAccountById } from "./server/handlers/api/accounts/[id]/utils.ts";
			export { deleteAccounts } from "./server/lib/accounts/deletion.ts";
			export * as membersRoute from "./server/handlers/api/groups/[id]/members/route.ts";
			export * as groupsRoute from "./server/handlers/api/groups/route.ts";
			export * as accessRoute from "./server/handlers/api/mailboxes/[id]/access/route.ts";
			export * as summaryRoute from "./server/handlers/api/mailboxes/[id]/access-summary/route.ts";
			export * as detail from "./server/handlers/api/mailboxes/[id]/route.ts";
			export * as domainRoute from "./server/handlers/api/domains/[id]/route.ts";
			export * as accountsRoute from "./server/handlers/api/accounts/route.ts";
			export * as sharedInboxesRoute from "./server/handlers/api/shared-inboxes/route.ts";
			export * as restoreRoute from "./server/handlers/api/shared-inboxes/[id]/restore/route.ts";
			export * as inboxSettingsRoute from "./server/handlers/api/mailboxes/[id]/inbox-settings/route.ts";
		`,
		resolveDir: root,
		sourcefile: "inbox-principals-test-entry.ts",
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
	SqliteDatabase, applyMigrations, getDb, createSession, getMailboxAccessLevel, listAccessibleMailboxes, createInboxPrincipal,
	grantCreatorFullAccess, inboxPrincipalId, listAccountsForAdmin, countUsedAccountSeats, selectAccountById, deleteAccounts,
	membersRoute, groupsRoute, accessRoute, summaryRoute, detail, domainRoute, accountsRoute, sharedInboxesRoute, restoreRoute, inboxSettingsRoute,
} = await import(pathToFileURL(join(directory, "entry.mjs")).href);
const context = id => ({ params: Promise.resolve({ id }) });
const primary = { id: "primary", role: "admin", isPrimaryAdmin: true, canManageUsers: true, canManageMailboxes: false };

/** Every migration before 0093, so a test can seed the old shape and then upgrade. */
function migrationsBefore0093() {
	const dir = join(directory, `before-${Math.random().toString(36).slice(2)}`);
	mkdirSync(dir, { recursive: true });
	for (const name of readdirSync(migrations)) {
		if (name < "0093") cpSync(join(migrations, name), join(dir, name), { recursive: true });
	}
	return dir;
}

async function fixture({ upgrade = true } = {}) {
	const database = new SqliteDatabase(":memory:");
	onTestFinished(() => database.db.close());
	await applyMigrations(database, migrationsBefore0093());
	const sql = database.db;
	const addUser = sql.prepare(`INSERT INTO users
		(id, email, password_hash, name, role, is_primary_admin, can_manage_users, can_manage_mailboxes, created_by_user_id, disabled, spam_protection_enabled, trash_retention_days, created_at)
		VALUES (?, ?, 'hash', ?, ?, ?, ?, 0, ?, 0, ?, ?, 1)`);
	for (const row of [
		["primary", "owner@one.test", "Owner", "admin", 1, 1, null, 0, 30],
		["anna", "anna@one.test", "Anna", "user", 0, 0, "primary", 1, null],
	]) addUser.run(...row);
	sql.exec(`
		INSERT INTO domains (id, user_id, hostname, zone_id, status, created_at) VALUES ('one', 'primary', 'one.test', 'zone-one', 'active', 1);
		INSERT INTO mailboxes (id, user_id, domain_id, local_part, display_name, type, use_all_domains, disabled, created_at) VALUES
			('m-support', 'primary', 'one', 'support', 'Support', 'shared', 0, 0, 1),
			('m-owner', 'primary', 'one', 'owner', 'Owner', 'personal', 0, 0, 1);
		INSERT INTO folders (id, user_id, mailbox_id, name, created_at) VALUES ('f-support', 'primary', 'm-support', 'Orders', 1), ('f-owner', 'primary', 'm-owner', 'Mine', 1);
		INSERT INTO messages (id, user_id, mailbox_id, direction, from_addr, to_addr, status, created_at) VALUES
			('in-support', 'primary', 'm-support', 'inbound', 'a@x.test', 'support@one.test', 'received', 1),
			('draft-support', 'primary', 'm-support', 'outbound', 'support@one.test', 'a@x.test', 'draft', 1),
			('in-owner', 'primary', 'm-owner', 'inbound', 'b@x.test', 'owner@one.test', 'received', 1);
		INSERT INTO contacts (id, user_id, email, source, blocked, remote_content_allowed, created_at) VALUES
			('c-blocked', 'primary', 'spam@x.test', 'manual', 1, 0, 1),
			('c-plain', 'primary', 'friend@x.test', 'manual', 0, 0, 1);
	`);
	if (upgrade) await applyMigrations(database, migrations);
	const env = { DB: database, MAILFLARE_RUNTIME: "node", CF_TOKEN: "test-only" };
	globalThis.__mailflareNodeEnv = env;
	onTestFinished(() => { delete globalThis.__mailflareNodeEnv; });
	const realFetch = globalThis.fetch;
	globalThis.fetch = async () => new Response(JSON.stringify({ success: true, result: [], errors: [], messages: [] }), { headers: { "Content-Type": "application/json" } });
	onTestFinished(() => { globalThis.fetch = realFetch; });
	const sessions = new Map([["primary", await createSession(env, "primary")], ["anna", await createSession(env, "anna")]]);
	const request = (actor, path, method = "GET", body) => new Request(`https://mail.test${path}`, {
		method,
		headers: { Authorization: `Bearer ${sessions.get(actor)}`, Origin: "https://mail.test", "Content-Type": "application/json" },
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
	return { sql, env, db: getDb(env), request };
}

test("the upgrade gives each existing shared inbox its own holder and keeps the admin's access", async () => {
	const f = await fixture();
	const principal = inboxPrincipalId("m-support");
	const holder = f.sql.prepare("SELECT kind, email, name, password_hash, spam_protection_enabled, trash_retention_days FROM users WHERE id = ?").get(principal);
	assert.deepEqual(holder, { kind: "inbox", email: "m-support@inbox.invalid", name: "Support", password_hash: "!passkey-only", spam_protection_enabled: 0, trash_retention_days: 30 });
	assert.equal(f.sql.prepare("SELECT kind FROM users WHERE id = 'primary'").get().kind, "person");

	const owners = Object.fromEntries(f.sql.prepare("SELECT id, user_id FROM mailboxes").all().map(row => [row.id, row.user_id]));
	assert.deepEqual(owners, { "m-support": principal, "m-owner": "primary" });
	// Mail that arrived moves with the inbox; the admin's draft and their own mailbox do not.
	const messageOwners = Object.fromEntries(f.sql.prepare("SELECT id, user_id FROM messages").all().map(row => [row.id, row.user_id]));
	assert.deepEqual(messageOwners, { "in-support": principal, "draft-support": "primary", "in-owner": "primary" });
	const folderOwners = Object.fromEntries(f.sql.prepare("SELECT id, user_id FROM folders").all().map(row => [row.id, row.user_id]));
	assert.deepEqual(folderOwners, { "f-support": principal, "f-owner": "primary" });
	// Blocked senders still apply to the inbox; ordinary contacts stay the admin's own.
	assert.deepEqual(f.sql.prepare("SELECT email, blocked FROM contacts WHERE user_id = ?").all(principal), [{ email: "spam@x.test", blocked: 1 }]);

	const access = await getMailboxAccessLevel(f.db, { id: "primary", role: "admin" }, "m-support");
	assert.equal(access.permission, "full_access");
	assert.equal(access.isOwner, false);
	const listed = await listAccessibleMailboxes(f.db, { id: "primary", email: "owner@one.test", role: "admin" });
	assert.deepEqual(listed.map(mailbox => [mailbox.id, mailbox.permission]).sort(), [["m-owner", "full_access"], ["m-support", "full_access"]]);
});

test("the upgrade can run again without changing anything", async () => {
	const f = await fixture();
	const before = f.sql.prepare("SELECT COUNT(*) AS n FROM users").get().n;
	f.sql.exec("DELETE FROM d1_migrations WHERE name = '0093_inbox_principals.sql'");
	// The column already exists, so only the data statements can be re-run; they must be no-ops.
	const statements = (await import("node:fs")).readFileSync(join(migrations, "0093_inbox_principals", "migration.sql"), "utf8")
		.split(/-->\s*statement-breakpoint/g).map(statement => statement.replace(/^\s*--.*$/gm, "").trim()).filter(Boolean).slice(2);
	for (const statement of statements) f.sql.exec(statement);
	assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM users").get().n, before);
	assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM mailbox_access WHERE mailbox_id = 'm-support'").get().n, 1);
});

test("an inbox's hidden account never signs in and is never listed or picked as a person", async () => {
	const f = await fixture();
	const principal = inboxPrincipalId("m-support");

	// A session for it, however it came about, is refused.
	const token = await createSession(f.env, principal);
	const asInbox = new Request("https://mail.test/api/mailboxes/m-support", { headers: { Authorization: `Bearer ${token}` } });
	await assert.rejects(() => detail.GET(asInbox, context("m-support")), /Unauthorized/);

	const accounts = await listAccountsForAdmin(f.db);
	assert.deepEqual(accounts.map(account => account.id).sort(), ["anna", "primary"]);
	assert.equal(await countUsedAccountSeats(f.env), 2);
	assert.equal(await selectAccountById(f.db, principal), null);

	const removed = await deleteAccounts(f.env, primary, { ids: [principal] });
	assert.equal(removed.ok, false);
	assert.equal(removed.status, 404);

	const created = await (await groupsRoute.POST(f.request("primary", "/api/groups", "POST", { name: "Support" }))).json();
	const candidates = await (await membersRoute.GET(f.request("primary", `/api/groups/${created.group.id}/members`), context(created.group.id))).json();
	assert.ok(!candidates.candidates.some(candidate => candidate.id === principal));
	const addInbox = await membersRoute.POST(f.request("primary", `/api/groups/${created.group.id}/members`, "POST", { userId: principal }), context(created.group.id));
	assert.equal(addInbox.status, 404);

	const shareState = await (await accessRoute.GET(f.request("primary", "/api/mailboxes/m-support/access"), context("m-support"))).json();
	const offered = (shareState.availableUsers ?? []).map(person => person.id);
	assert.ok(!offered.includes(principal));
	assert.ok(offered.includes("anna"));

	const summary = await (await summaryRoute.GET(f.request("primary", "/api/mailboxes/m-support/access-summary"), context("m-support"))).json();
	assert.deepEqual(summary.people.map(person => person.userId), ["primary"]);
});

test("deleting a shared inbox retires it with its hidden account, and deleting a person leaves it alone", async () => {
	const f = await fixture();
	await createInboxPrincipal(f.db, { mailboxId: "m-new", name: "Help" });
	f.sql.exec(`INSERT INTO mailboxes (id, user_id, domain_id, local_part, display_name, type, use_all_domains, disabled, created_at)
		VALUES ('m-new', '${inboxPrincipalId("m-new")}', 'one', 'help', 'Help', 'shared', 0, 0, 1)`);
	await grantCreatorFullAccess(f.db, "m-new", "anna");
	assert.equal((await getMailboxAccessLevel(f.db, { id: "anna", role: "user" }, "m-new")).permission, "full_access");

	// Deleting Anna takes her grant with her when she is purged; the inbox and its holder stay.
	assert.equal((await deleteAccounts(f.env, primary, { ids: ["anna"] })).ok, true);
	assert.deepEqual(f.sql.prepare("SELECT disabled, user_id FROM mailboxes WHERE id = 'm-new'").get(), { disabled: 0, user_id: inboxPrincipalId("m-new") });
	assert.equal(f.sql.prepare("SELECT deleted_at FROM users WHERE id = ?").get(inboxPrincipalId("m-new")).deleted_at, null);

	// A plain user cannot delete it; an admin who manages shared inboxes can.
	await assert.rejects(() => detail.DELETE(f.request("anna", "/api/mailboxes/m-new", "DELETE"), context("m-new")), /Unauthorized/);
	const deleted = await detail.DELETE(f.request("primary", "/api/mailboxes/m-new", "DELETE"), context("m-new"));
	assert.equal(deleted.status, 200);
	assert.equal(f.sql.prepare("SELECT disabled FROM mailboxes WHERE id = 'm-new'").get().disabled, 1);
	const retired = f.sql.prepare("SELECT disabled, deleted_at FROM users WHERE id = ?").get(inboxPrincipalId("m-new"));
	assert.equal(retired.disabled, 1);
	assert.notEqual(retired.deleted_at, null);
	// The admin's own account is never touched.
	assert.equal(f.sql.prepare("SELECT deleted_at FROM users WHERE id = 'primary'").get().deleted_at, null);
});

test("before the upgrade is applied, people can still sign in and reach the app", async () => {
	const f = await fixture({ upgrade: false });
	const response = await detail.GET(f.request("primary", "/api/mailboxes/m-owner"), context("m-owner"));
	assert.equal(response.status, 200);
	assert.equal((await selectAccountById(f.db, "anna")).id, "anna");
});

test("an admin who owns domains is only deleted when an admin who manages domains takes them over", async () => {
	const f = await fixture();
	f.sql.exec(`INSERT INTO users (id, email, password_hash, name, role, can_manage_domains, created_by_user_id, created_at) VALUES
		('dom-admin', 'dom@one.test', 'hash', 'Domain admin', 'admin', 1, 'primary', 1),
		('helper', 'helper@one.test', 'hash', 'Helper', 'admin', 0, 'primary', 1);
		INSERT INTO domains (id, user_id, hostname, zone_id, status, created_at) VALUES ('two', 'dom-admin', 'two.test', 'zone-two', 'active', 1);
		INSERT INTO mailboxes (id, user_id, domain_id, local_part, display_name, type, use_all_domains, disabled, created_at)
			VALUES ('m-anna-two', 'anna', 'two', 'anna', 'Anna', 'personal', 0, 0, 1);`);

	const listed = await (await accountsRoute.GET(f.request("primary", "/api/accounts"))).json();
	assert.deepEqual(listed.accounts.find(account => account.id === "dom-admin").ownedDomains, ["two.test"]);
	assert.deepEqual(listed.accounts.find(account => account.id === "anna").ownedDomains, []);

	const blocked = await deleteAccounts(f.env, primary, { ids: ["dom-admin"] });
	assert.equal(blocked.status, 409);
	assert.match(blocked.error, /two\.test/);
	const wrongRecipient = await deleteAccounts(f.env, primary, { ids: ["dom-admin"], transferToId: "helper" });
	assert.equal(wrongRecipient.status, 400);
	assert.equal(f.sql.prepare("SELECT deleted_at FROM users WHERE id = 'dom-admin'").get().deleted_at, null);

	assert.equal((await deleteAccounts(f.env, primary, { ids: ["dom-admin"], transferToId: "primary" })).ok, true);
	assert.equal(f.sql.prepare("SELECT user_id FROM domains WHERE id = 'two'").get().user_id, "primary");
	// Anna's mailbox on the domain no longer depends on the deleted admin.
	assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM mailboxes WHERE id = 'm-anna-two'").get().n, 1);
});

test("a domain that hosts a shared inbox cannot be deleted", async () => {
	const f = await fixture();
	const response = await domainRoute.DELETE(f.request("primary", "/api/domains/one", "DELETE"), context("one"));
	assert.equal(response.status, 409);
	assert.match((await response.json()).error, /support@one\.test/);
	assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM domains WHERE id = 'one'").get().n, 1);
});

test("admins who manage shared inboxes see every one, and can restore a deleted one", async () => {
	const f = await fixture();
	f.sql.exec("INSERT INTO mailbox_access (id, mailbox_id, user_id, permission, created_at) VALUES ('anna-ro', 'm-support', 'anna', 'read_only', 1)");
	await assert.rejects(async () => {
		const response = await sharedInboxesRoute.GET(f.request("anna", "/api/shared-inboxes"));
		if (response.status === 403) throw new Error("Forbidden");
	}, /Forbidden/);

	const listed = await (await sharedInboxesRoute.GET(f.request("primary", "/api/shared-inboxes"))).json();
	assert.deepEqual(listed.inboxes.map(inbox => [inbox.address, inbox.deleted, inbox.peopleCount]), [["support@one.test", false, 2]]);

	assert.equal((await detail.DELETE(f.request("primary", "/api/mailboxes/m-support", "DELETE"), context("m-support"))).status, 200);
	const afterDelete = await (await sharedInboxesRoute.GET(f.request("primary", "/api/shared-inboxes"))).json();
	assert.equal(afterDelete.inboxes[0].deleted, true);
	assert.ok(afterDelete.inboxes[0].purgeAt);
	assert.equal(await getMailboxAccessLevel(f.db, { id: "primary", role: "admin" }, "m-support"), null);

	const restored = await restoreRoute.POST(f.request("primary", "/api/shared-inboxes/m-support/restore", "POST"), context("m-support"));
	assert.equal(restored.status, 200);
	assert.equal((await getMailboxAccessLevel(f.db, { id: "primary", role: "admin" }, "m-support")).permission, "full_access");
	assert.equal(f.sql.prepare("SELECT deleted_at FROM users WHERE id = ?").get(inboxPrincipalId("m-support")).deleted_at, null);
	// A personal mailbox is never "restored" through this route.
	assert.equal((await restoreRoute.POST(f.request("primary", "/api/shared-inboxes/m-owner/restore", "POST"), context("m-owner"))).status, 404);
});

test("a shared inbox has its own spam and trash settings, and renaming it renames its hidden account", async () => {
	const f = await fixture();
	const principal = inboxPrincipalId("m-support");
	const settings = async (actor, mailboxId = "m-support", body) => {
		const response = body === undefined
			? await inboxSettingsRoute.GET(f.request(actor, `/api/mailboxes/${mailboxId}/inbox-settings`), context(mailboxId))
			: await inboxSettingsRoute.PATCH(f.request(actor, `/api/mailboxes/${mailboxId}/inbox-settings`, "PATCH", body), context(mailboxId));
		return { status: response.status, body: await response.json() };
	};

	// The upgrade copied the former holder's settings onto the inbox.
	assert.deepEqual(await settings("primary"), { status: 200, body: { settings: { spamProtectionEnabled: false, trashRetentionDays: 30 }, canManage: true } });
	// A personal mailbox has no inbox settings, and someone without access sees nothing.
	assert.equal((await settings("primary", "m-owner")).status, 404);
	assert.equal((await settings("anna")).status, 404);

	// Read-only access shows the settings but cannot change them.
	f.sql.exec("INSERT INTO mailbox_access (id, mailbox_id, user_id, permission, created_at) VALUES ('anna-ro', 'm-support', 'anna', 'read_only', 1)");
	assert.equal((await settings("anna")).body.canManage, false);
	assert.equal((await settings("anna", "m-support", { spamProtectionEnabled: true })).status, 404);

	// Full access can change them, and the change lands on the inbox, not on the person.
	f.sql.exec("UPDATE mailbox_access SET permission = 'full_access' WHERE id = 'anna-ro'");
	const updated = await settings("anna", "m-support", { spamProtectionEnabled: true, trashRetentionDays: null });
	assert.deepEqual(updated.body.settings, { spamProtectionEnabled: true, trashRetentionDays: null });
	assert.deepEqual(f.sql.prepare("SELECT spam_protection_enabled, trash_retention_days FROM users WHERE id = ?").get(principal), { spam_protection_enabled: 1, trash_retention_days: null });
	assert.deepEqual(f.sql.prepare("SELECT spam_protection_enabled, trash_retention_days FROM users WHERE id = 'anna'").get(), { spam_protection_enabled: 1, trash_retention_days: null });
	assert.equal((await settings("anna", "m-support", { trashRetentionDays: 0 })).status, 400);

	const renamed = await detail.PATCH(f.request("anna", "/api/mailboxes/m-support", "PATCH", { displayName: "Customer support" }), context("m-support"));
	assert.equal(renamed.status, 200);
	assert.equal(f.sql.prepare("SELECT name FROM users WHERE id = ?").get(principal).name, "Customer support");
	assert.equal(f.sql.prepare("SELECT name FROM users WHERE id = 'anna'").get().name, "Anna");
});
