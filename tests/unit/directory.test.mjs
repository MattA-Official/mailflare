// Fork-only: the instance directory and org chart (contacts plan, phase 2; migration directory_profiles).
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterAll as after, test, onTestFinished } from "vitest";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "./helpers/esbuild.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const directory = mkdtempSync(join(root, "node_modules", "directory-test-"));
after(() => rmSync(directory, { recursive: true, force: true }));
await build({
	stdin: {
		contents: `
			export { SqliteDatabase } from "./tests/unit/helpers/sqlite-database.mjs";
			export { applyMigrations } from "./tests/unit/helpers/migrate.mjs";
			export { createSession } from "./server/lib/auth/session.ts";
			export { wouldLoop } from "./server/lib/directory/service.ts";
			export * as listRoute from "./server/handlers/api/directory/route.ts";
			export * as personRoute from "./server/handlers/api/directory/people/[id]/route.ts";
			export * as groupRoute from "./server/handlers/api/directory/groups/[id]/route.ts";
			export * as profileRoute from "./server/handlers/api/directory/profile/route.ts";
			export * as orgRoute from "./server/handlers/api/directory/org-chart/route.ts";
			export * as settingsRoute from "./server/handlers/api/directory/settings/route.ts";
		`,
		resolveDir: root,
		sourcefile: "directory-test-entry.ts",
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
const { SqliteDatabase, applyMigrations, createSession, wouldLoop, listRoute, personRoute, groupRoute, profileRoute, orgRoute, settingsRoute } =
	await import(pathToFileURL(join(directory, "entry.mjs")).href);
const context = id => ({ params: Promise.resolve({ id }) });

async function fixture({ migrated = true } = {}) {
	const database = new SqliteDatabase(":memory:");
	onTestFinished(() => database.db.close());
	await applyMigrations(database, join(root, "server/db/migrations/sqlite"));
	const sql = database.db;
	if (!migrated) sql.exec("DROP TABLE user_profiles; DROP TABLE directory_settings;");
	const addUser = sql.prepare(`INSERT INTO users (id, email, password_hash, name, role, is_primary_admin, disabled, created_at) VALUES (?, ?, 'hash', ?, ?, ?, ?, 1)`);
	for (const row of [
		["primary", "owner@one.test", "Owner", "admin", 1, 0],
		["anna", "anna@one.test", "Anna", "user", 0, 0],
		["ben", "ben@one.test", "Ben", "user", 0, 0],
		["cara", "cara@one.test", "Cara", "user", 0, 0],
		["off", "off@one.test", "Disabled", "user", 0, 1],
	]) addUser.run(...row);
	sql.exec(`
		INSERT INTO domains (id, user_id, hostname, zone_id, status, created_at) VALUES ('one', 'primary', 'one.test', 'zone-one', 'active', 1);
		INSERT INTO mailboxes (id, user_id, domain_id, local_part, display_name, type, use_all_domains, disabled, created_at) VALUES
			('m-anna', 'anna', 'one', 'anna', 'Anna', 'personal', 0, 0, 1),
			('m-support', 'primary', 'one', 'support', 'Support', 'shared', 0, 0, 1);
		INSERT INTO mailbox_aliases (id, mailbox_id, domain_id, local_part, created_at) VALUES ('a1', 'm-anna', 'one', 'hello', 2);
		INSERT INTO groups (id, name, created_at) VALUES ('g-eng', 'Engineering', 1), ('g-web', 'Web', 1);
		INSERT INTO group_members (id, group_id, user_id, role, created_at) VALUES
			('gm1', 'g-eng', 'anna', 'manager', 1), ('gm2', 'g-web', 'ben', 'member', 1), ('gm3', 'g-eng', 'off', 'member', 1);
		INSERT INTO group_subgroups (parent_group_id, child_group_id, created_at) VALUES ('g-eng', 'g-web', 1);
		INSERT INTO mailbox_managers (mailbox_id, group_id, created_at) VALUES ('m-support', 'g-eng', 1);
	`);
	const env = { DB: database, MAILFLARE_RUNTIME: "node", CF_TOKEN: "test-only" };
	globalThis.__mailflareNodeEnv = env;
	onTestFinished(() => { delete globalThis.__mailflareNodeEnv; });
	const sessions = new Map();
	for (const id of ["primary", "anna", "ben", "cara"]) sessions.set(id, await createSession(env, id));
	const request = (actor, path, method = "GET", body) => new Request(`https://mail.test${path}`, {
		method,
		headers: { Authorization: `Bearer ${sessions.get(actor)}`, Origin: "https://mail.test", "Content-Type": "application/json" },
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
	const patchPerson = (actor, id, body) => personRoute.PATCH(request(actor, `/api/directory/people/${id}`, "PATCH", body), context(id));
	return { sql, request, patchPerson };
}

test("everyone signed in sees people, groups and shared inboxes; disabled accounts are left out", async () => {
	const f = await fixture();
	const response = await listRoute.GET(f.request("ben", "/api/directory"));
	assert.equal(response.status, 200);
	const data = await response.json();
	assert.deepEqual(data.people.map(person => person.id), ["anna", "ben", "cara", "primary"]);
	assert.equal(data.people.find(person => person.id === "anna").email, "anna@one.test");
	assert.deepEqual(data.groups.map(group => [group.name, group.memberCount]), [["Engineering", 1], ["Web", 1]]);
	assert.deepEqual(data.inboxes, [{ id: "m-support", name: "Support", address: "support@one.test", managers: [{ id: "g-eng", name: "Engineering" }] }]);
	assert.equal(data.isAdmin, false);
	assert.equal(data.profilesAvailable, true);

	const searched = await (await listRoute.GET(f.request("ben", "/api/directory?q=hello"))).json();
	assert.deepEqual(searched.people.map(person => person.id), ["anna"]);

	const anna = await (await personRoute.GET(f.request("ben", "/api/directory/people/anna"), context("anna"))).json();
	assert.deepEqual(anna.person.addresses, ["anna@one.test", "hello@one.test"]);
	assert.deepEqual(anna.person.groups, [{ id: "g-eng", name: "Engineering", role: "manager" }]);
	assert.equal(anna.canEdit, false);
	assert.equal((await personRoute.GET(f.request("ben", "/api/directory/people/off"), context("off"))).status, 404);

	const group = await (await groupRoute.GET(f.request("ben", "/api/directory/groups/g-eng"), context("g-eng"))).json();
	assert.deepEqual(group.group.members.map(member => [member.id, member.role]), [["anna", "manager"]]);
	assert.deepEqual(group.group.subgroups.map(item => item.id), ["g-web"]);
	assert.deepEqual(group.group.inboxes.map(item => item.id), ["m-support"]);
});

test("people edit their own profile; only admins edit others or hide them", async () => {
	const f = await fixture();
	const own = await f.patchPerson("anna", "anna", { title: "Lead engineer", department: "Engineering", pronouns: "she/her" });
	assert.equal(own.status, 200);
	const read = await (await profileRoute.GET(f.request("anna", "/api/directory/profile"))).json();
	assert.equal(read.profile.title, "Lead engineer");
	assert.equal(read.profile.pronouns, "she/her");

	assert.equal((await f.patchPerson("ben", "anna", { title: "Intern" })).status, 403);
	assert.equal((await f.patchPerson("anna", "anna", { hidden: true })).status, 403);
	assert.equal((await f.patchPerson("primary", "cara", { hidden: true })).status, 200);
	const list = await (await listRoute.GET(f.request("ben", "/api/directory"))).json();
	assert.equal(list.people.some(person => person.id === "cara"), false);
	assert.deepEqual(list.departments, ["Engineering"]);

	// Admins can stop people changing their own title, department and manager.
	assert.equal((await settingsRoute.PATCH(f.request("anna", "/api/directory/settings", "PATCH", { selfEditOrg: false }))).status, 403);
	assert.equal((await settingsRoute.PATCH(f.request("primary", "/api/directory/settings", "PATCH", { selfEditOrg: false }))).status, 200);
	assert.equal((await f.patchPerson("anna", "anna", { title: "CTO" })).status, 403);
	assert.equal((await f.patchPerson("anna", "anna", { phone: "+44 1234" })).status, 200);
});

test("reports-to refuses loops, and hidden managers are skipped in the chart", async () => {
	const f = await fixture();
	assert.equal((await f.patchPerson("primary", "anna", { reportsToUserId: "primary" })).status, 200);
	assert.equal((await f.patchPerson("primary", "ben", { reportsToUserId: "anna" })).status, 200);
	assert.equal((await f.patchPerson("primary", "cara", { reportsToUserId: "ben" })).status, 200);
	const loop = await f.patchPerson("primary", "primary", { reportsToUserId: "cara" });
	assert.equal(loop.status, 409);
	assert.equal((await loop.json()).code, "reporting_loop");
	assert.equal((await f.patchPerson("primary", "anna", { reportsToUserId: "anna" })).status, 409);
	assert.equal((await f.patchPerson("primary", "anna", { reportsToUserId: "off" })).status, 400);

	const cara = await (await personRoute.GET(f.request("cara", "/api/directory/people/cara"), context("cara"))).json();
	assert.deepEqual(cara.person.reportsTo.map(person => person.id), ["ben", "anna", "primary"]);

	assert.equal((await f.patchPerson("primary", "ben", { hidden: true })).status, 200);
	const chart = await (await orgRoute.GET(f.request("cara", "/api/directory/org-chart"))).json();
	const managers = Object.fromEntries(chart.people.map(person => [person.id, person.managerId]));
	assert.deepEqual(managers, { anna: "primary", cara: "anna", primary: null });
	assert.equal(chart.canReassign, false);
	assert.deepEqual(chart.groups.find(group => group.id === "g-web").parentIds, ["g-eng"]);

	const profiles = new Map([["a", { reportsToUserId: "b" }], ["b", { reportsToUserId: "a" }]]);
	assert.equal(wouldLoop(profiles, "c", "a"), false);
	assert.equal(wouldLoop(profiles, "a", "b"), true);
});

test("before the migration is applied the directory still lists everyone and writes say so", async () => {
	const f = await fixture({ migrated: false });
	const data = await (await listRoute.GET(f.request("ben", "/api/directory"))).json();
	assert.equal(data.profilesAvailable, false);
	assert.equal(data.people.length, 4);
	const person = await (await personRoute.GET(f.request("anna", "/api/directory/people/anna"), context("anna"))).json();
	assert.equal(person.canEdit, false);
	const write = await f.patchPerson("anna", "anna", { title: "Lead" });
	assert.equal(write.status, 503);
	assert.equal((await write.json()).code, "needs_migration");
	assert.equal((await orgRoute.GET(f.request("anna", "/api/directory/org-chart"))).status, 200);
	const profile = await (await profileRoute.GET(f.request("anna", "/api/directory/profile"))).json();
	assert.equal(profile.available, false);
});
