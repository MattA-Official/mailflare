// Fork-only: shared drives held by their own hidden account (migration 0094_shared_drives).
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterAll as after, test, onTestFinished } from "vitest";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "./helpers/esbuild.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const migrations = join(root, "server/db/migrations/sqlite");
const directory = mkdtempSync(join(root, "node_modules", "shared-drives-test-"));
after(() => rmSync(directory, { recursive: true, force: true }));
await build({
	stdin: {
		contents: `
			export { SqliteDatabase } from "./tests/unit/helpers/sqlite-database.mjs";
			export { applyMigrations } from "./tests/unit/helpers/migrate.mjs";
			export { getDb } from "./server/db/index.ts";
			export { createSession } from "./server/lib/auth/session.ts";
			export { getDriveRole, getDriveItem, getPublicDriveItem } from "./server/lib/drive/access.ts";
			export { listAccountsForAdmin } from "./server/handlers/api/accounts/utils.ts";
			export { deleteAccounts } from "./server/lib/accounts/deletion.ts";
			export * as drivesRoute from "./server/handlers/api/drives/route.ts";
			export * as driveRoute from "./server/handlers/api/drives/[id]/route.ts";
			export * as membersRoute from "./server/handlers/api/drives/[id]/members/route.ts";
			export * as itemsRoute from "./server/handlers/api/drive/items/route.ts";
			export * as itemRoute from "./server/handlers/api/drive/items/[id]/route.ts";
			export * as uploadRoute from "./server/handlers/api/drive/upload/route.ts";
			export * as bulkRoute from "./server/handlers/api/drive/items/bulk/route.ts";
			export * as foldersRoute from "./server/handlers/api/drive/folders/route.ts";
			export * as adminDrivesRoute from "./server/handlers/api/shared-drives/route.ts";
			export * as restoreRoute from "./server/handlers/api/shared-drives/[id]/restore/route.ts";
		`,
		resolveDir: root,
		sourcefile: "shared-drives-test-entry.ts",
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
	SqliteDatabase, applyMigrations, getDb, createSession, getDriveRole, getDriveItem, getPublicDriveItem, listAccountsForAdmin, deleteAccounts,
	drivesRoute, driveRoute, membersRoute, itemsRoute, itemRoute, uploadRoute, bulkRoute, foldersRoute, adminDrivesRoute, restoreRoute,
} = await import(pathToFileURL(join(directory, "entry.mjs")).href);
const context = id => ({ params: Promise.resolve({ id }) });
const primary = { id: "primary", role: "admin", isPrimaryAdmin: true, canManageUsers: true, canManageMailboxes: false };

/** Every migration except 0094, as a database looks after deploy and before the update card is used. */
function migrationsWithout0094() {
	const dir = join(directory, `without-${Math.random().toString(36).slice(2)}`);
	mkdirSync(join(dir, "meta"), { recursive: true });
	for (const name of readdirSync(migrations)) {
		if (name.endsWith(".sql") && !name.startsWith("0094")) copyFileSync(join(migrations, name), join(dir, name));
	}
	copyFileSync(join(migrations, "meta", "_journal.json"), join(dir, "meta", "_journal.json"));
	return dir;
}

async function fixture({ withDrives = true } = {}) {
	const database = new SqliteDatabase(":memory:");
	onTestFinished(() => database.db.close());
	await applyMigrations(database, withDrives ? migrations : migrationsWithout0094());
	const sql = database.db;
	const addUser = sql.prepare(`INSERT INTO users
		(id, email, password_hash, name, role, is_primary_admin, can_manage_users, can_manage_mailboxes, disabled, created_at)
		VALUES (?, ?, 'hash', ?, ?, ?, ?, 0, 0, 1)`);
	for (const row of [
		["primary", "owner@one.test", "Owner", "admin", 1, 1],
		["anna", "anna@one.test", "Anna", "user", 0, 0],
		["ben", "ben@one.test", "Ben", "user", 0, 0],
		["cara", "cara@one.test", "Cara", "user", 0, 0],
	]) addUser.run(...row);
	// Ben is in Sales, which sits inside Everyone. Cara is in no group.
	sql.exec(`
		INSERT INTO groups (id, name, created_at) VALUES ('everyone', 'Everyone', 1), ('sales', 'Sales', 1);
		INSERT INTO group_members (id, group_id, user_id, role, created_at) VALUES ('gm-ben', 'sales', 'ben', 'member', 1);
		INSERT INTO group_subgroups (parent_group_id, child_group_id, created_at) VALUES ('everyone', 'sales', 1);
	`);
	const env = { DB: database, MAILFLARE_RUNTIME: "node", CF_TOKEN: "test-only", BUCKET: fakeBucket() };
	globalThis.__mailflareNodeEnv = env;
	onTestFinished(() => { delete globalThis.__mailflareNodeEnv; });
	const sessions = new Map();
	for (const id of ["primary", "anna", "ben", "cara"]) sessions.set(id, await createSession(env, id));
	const request = (actor, path, method = "GET", body) => new Request(`https://mail.test${path}`, {
		method,
		headers: { Authorization: `Bearer ${sessions.get(actor)}`, Origin: "https://mail.test", "Content-Type": "application/json" },
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
	const createDrive = async (name = "Team files") => (await (await drivesRoute.POST(request("primary", "/api/drives", "POST", { name }))).json()).drive;
	return { sql, env, db: getDb(env), request, createDrive };
}

function fakeBucket() {
	const objects = new Map();
	return {
		put: async (key, value) => { objects.set(key, value); },
		delete: async (keys) => { for (const key of [keys].flat()) objects.delete(key); },
		get: async (key) => objects.get(key) ?? null,
		createMultipartUpload: async (key) => ({ key, uploadId: `upload-${key}` }),
	};
}

test("only admins create drives, and the drive is held by a hidden account nobody can pick", async () => {
	const f = await fixture();
	const refused = await drivesRoute.POST(f.request("anna", "/api/drives", "POST", { name: "Mine" }));
	assert.equal(refused.status, 403);

	const drive = await f.createDrive();
	assert.match(drive.id, /^drive_/);
	assert.deepEqual(f.sql.prepare("SELECT kind, email, name, password_hash FROM users WHERE id = ?").get(drive.id), { kind: "drive", email: `${drive.id}@drive.invalid`, name: "Team files", password_hash: "!passkey-only" });
	assert.deepEqual(f.sql.prepare("SELECT user_id, role FROM drive_members WHERE drive_id = ?").all(drive.id), [{ user_id: "primary", role: "manage" }]);

	// The hidden account is never listed as a person, and cannot be deleted as one.
	assert.ok(!(await listAccountsForAdmin(f.db)).some(account => account.id === drive.id));
	assert.equal((await deleteAccounts(f.env, primary, { ids: [drive.id] })).ok, false);
	// Nor can it be made a member of a drive.
	const asMember = await membersRoute.POST(f.request("primary", `/api/drives/${drive.id}/members`, "POST", { userId: drive.id, role: "view" }), context(drive.id));
	assert.equal(asMember.status, 404);
});

test("people and groups reach a drive through members, nested groups included, and nobody else does", async () => {
	const f = await fixture();
	const drive = await f.createDrive();
	const add = (body) => membersRoute.POST(f.request("primary", `/api/drives/${drive.id}/members`, "POST", body), context(drive.id));
	assert.equal((await add({ userId: "anna", role: "view" })).status, 200);
	assert.equal((await add({ groupId: "everyone", role: "edit" })).status, 200);

	const list = async (actor) => (await (await drivesRoute.GET(f.request(actor, "/api/drives"))).json()).drives.map(entry => [entry.id, entry.role]);
	assert.deepEqual(await list("anna"), [[drive.id, "view"]]);
	assert.deepEqual(await list("ben"), [[drive.id, "edit"]]); // through Sales, inside Everyone
	assert.deepEqual(await list("cara"), []);
	assert.deepEqual(await list("primary"), [[drive.id, "manage"]]);

	// An editor makes a folder at the top level: it belongs to the drive, not to them.
	const created = await itemsRoute.POST(f.request("ben", "/api/drive/items", "POST", { name: "Plans", driveId: drive.id }));
	assert.equal(created.status, 200);
	const folder = (await created.json()).item;
	assert.equal(folder.ownerId, drive.id);
	assert.equal(folder.role, "edit");
	// A viewer cannot, and someone outside cannot even see it.
	assert.equal((await itemsRoute.POST(f.request("anna", "/api/drive/items", "POST", { name: "Nope", driveId: drive.id }))).status, 404);
	assert.equal((await itemsRoute.GET(f.request("cara", `/api/drive/items?drive=${drive.id}`))).status, 404);

	const listing = await (await itemsRoute.GET(f.request("anna", `/api/drive/items?drive=${drive.id}`))).json();
	assert.deepEqual(listing.items.map(item => item.name), ["Plans"]);
	assert.equal(listing.role, "view");
	assert.deepEqual(listing.drive, { id: drive.id, name: "Team files", role: "view" });

	// Inside a folder the breadcrumb is the drive's whole path, and roles carry down.
	const row = await getDriveItem(f.db, folder.id);
	assert.equal(await getDriveRole(f.db, "anna", row), "view");
	assert.equal(await getDriveRole(f.db, "ben", row), "edit");
	assert.equal(await getDriveRole(f.db, "primary", row), "owner");
	assert.equal(await getDriveRole(f.db, "cara", row), null);
	const inside = await (await itemsRoute.GET(f.request("anna", `/api/drive/items?parent=${folder.id}`))).json();
	assert.deepEqual(inside.path.map(crumb => crumb.name), ["Plans"]);
	assert.equal(inside.drive.id, drive.id);
});

test("only managers restore and delete for good, and moves stay inside the drive", async () => {
	const f = await fixture();
	const drive = await f.createDrive();
	await membersRoute.POST(f.request("primary", `/api/drives/${drive.id}/members`, "POST", { userId: "anna", role: "edit" }), context(drive.id));
	await membersRoute.POST(f.request("primary", `/api/drives/${drive.id}/members`, "POST", { userId: "ben", role: "manage" }), context(drive.id));
	const folder = (await (await itemsRoute.POST(f.request("anna", "/api/drive/items", "POST", { name: "Old", driveId: drive.id }))).json()).item;
	const mine = (await (await itemsRoute.POST(f.request("ben", "/api/drive/items", "POST", { name: "Mine" }))).json()).item;

	// An editor can trash it but not bring it back.
	assert.equal((await itemRoute.PATCH(f.request("anna", `/api/drive/items/${folder.id}`, "PATCH", { trashed: true }), context(folder.id))).status, 200);
	assert.equal((await itemRoute.PATCH(f.request("anna", `/api/drive/items/${folder.id}`, "PATCH", { trashed: false }), context(folder.id))).status, 403);
	const trash = await (await itemsRoute.GET(f.request("anna", `/api/drive/items?drive=${drive.id}&view=trash`))).json();
	assert.deepEqual(trash.items.map(item => item.name), ["Old"]);
	assert.equal((await itemRoute.DELETE(f.request("anna", `/api/drive/items/${folder.id}`, "DELETE"), context(folder.id))).status, 404);
	// A manager can.
	assert.equal((await itemRoute.PATCH(f.request("ben", `/api/drive/items/${folder.id}`, "PATCH", { trashed: false }), context(folder.id))).status, 200);

	// Moving a person's own folder into the drive hands it to the drive.
	const crossing = await bulkRoute.POST(f.request("ben", "/api/drive/items/bulk", "POST", { action: "move", ids: [mine.id], parentId: folder.id }));
	assert.equal(crossing.status, 200);
	assert.equal((await getDriveItem(f.db, mine.id)).ownerId, drive.id);
});

test("a drive keeps a manager, uses its own storage cap, and goes only when deleted on purpose", async () => {
	const f = await fixture();
	const drive = await f.createDrive();
	const membership = f.sql.prepare("SELECT id FROM drive_members WHERE drive_id = ? AND user_id = 'primary'").get(drive.id).id;
	const removeLast = await membersRoute.DELETE(f.request("primary", `/api/drives/${drive.id}/members?memberId=${membership}`, "DELETE"), context(drive.id));
	assert.equal(removeLast.status, 409);
	const downgrade = await membersRoute.POST(f.request("primary", `/api/drives/${drive.id}/members`, "POST", { userId: "primary", role: "edit" }), context(drive.id));
	assert.equal(downgrade.status, 409);

	// Managers who are not admins can rename but cannot change the cap.
	await membersRoute.POST(f.request("primary", `/api/drives/${drive.id}/members`, "POST", { userId: "anna", role: "manage" }), context(drive.id));
	assert.equal((await driveRoute.PATCH(f.request("anna", `/api/drives/${drive.id}`, "PATCH", { name: "Studio" }), context(drive.id))).status, 200);
	assert.equal((await driveRoute.PATCH(f.request("anna", `/api/drives/${drive.id}`, "PATCH", { storageLimitBytes: 10 }), context(drive.id))).status, 403);
	assert.equal((await driveRoute.PATCH(f.request("primary", `/api/drives/${drive.id}`, "PATCH", { storageLimitBytes: 10 }), context(drive.id))).status, 200);
	const tooBig = await uploadRoute.POST(f.request("anna", "/api/drive/upload", "POST", { name: "big.bin", size: 11, driveId: drive.id }));
	assert.equal(tooBig.status, 413);
	const fits = await uploadRoute.POST(f.request("anna", "/api/drive/upload", "POST", { name: "empty.txt", size: 0, driveId: drive.id }));
	assert.equal(fits.status, 200);
	const file = (await fits.json()).item;
	assert.equal(file.ownerId, drive.id);

	// Deleting a person leaves the drive alone.
	assert.equal((await deleteAccounts(f.env, primary, { ids: ["anna"] })).ok, true);
	assert.equal(f.sql.prepare("SELECT deleted_at FROM users WHERE id = ?").get(drive.id).deleted_at, null);

	// Deleting the drive hides it and its files from everyone at once, links included.
	f.sql.prepare("UPDATE drive_items SET link_token = 'tok' WHERE id = ?").run(file.id);
	assert.ok(await getPublicDriveItem(f.db, "tok"));
	assert.equal((await driveRoute.DELETE(f.request("primary", `/api/drives/${drive.id}`, "DELETE"), context(drive.id))).status, 200);
	assert.equal(await getDriveRole(f.db, "primary", await getDriveItem(f.db, file.id)), null);
	assert.equal(await getPublicDriveItem(f.db, "tok"), null);
	assert.deepEqual((await (await drivesRoute.GET(f.request("primary", "/api/drives"))).json()).drives, []);
	assert.notEqual(f.sql.prepare("SELECT deleted_at FROM users WHERE id = ?").get(drive.id).deleted_at, null);
});

test("before migration 0094 is applied, Drive works as if there were no shared drives", async () => {
	const f = await fixture({ withDrives: false });
	const folder = await itemsRoute.POST(f.request("anna", "/api/drive/items", "POST", { name: "Mine" }));
	assert.equal(folder.status, 200);
	const created = (await folder.json()).item;
	f.sql.exec(`INSERT INTO drive_shares (id, item_id, user_id, role, created_at) VALUES ('s1', '${created.id}', 'ben', 'view', 1)`);
	const listing = await itemsRoute.GET(f.request("anna", "/api/drive/items"));
	assert.equal(listing.status, 200);
	assert.deepEqual((await listing.json()).items.map(item => item.name), ["Mine"]);
	assert.equal((await itemsRoute.GET(f.request("ben", `/api/drive/items?parent=${created.id}`))).status, 200);
	assert.equal(await getDriveRole(f.db, "ben", await getDriveItem(f.db, created.id)), "view");
	assert.equal((await uploadRoute.POST(f.request("anna", "/api/drive/upload", "POST", { name: "a.txt", size: 0 }))).status, 200);
	assert.deepEqual((await (await drivesRoute.GET(f.request("primary", "/api/drives"))).json()).drives, []);
	assert.equal((await drivesRoute.POST(f.request("primary", "/api/drives", "POST", { name: "Team" }))).status, 409);
});

test("items move between My Drive and shared drives: in with Edit, out only with Manage, and their files go with them", async () => {
	const f = await fixture();
	const drive = await f.createDrive();
	const add = (userId, role) => membersRoute.POST(f.request("primary", `/api/drives/${drive.id}/members`, "POST", { userId, role }), context(drive.id));
	await add("anna", "edit");
	await add("ben", "manage");
	const move = (actor, body) => bulkRoute.POST(f.request(actor, "/api/drive/items/bulk", "POST", { action: "move", ...body }));

	// Anna's folder, with a file inside, goes to the top of the drive.
	const folder = (await (await itemsRoute.POST(f.request("anna", "/api/drive/items", "POST", { name: "Brief" }))).json()).item;
	f.sql.exec(`INSERT INTO drive_items (id, owner_id, parent_id, kind, name, size, created_at, updated_at) VALUES ('inside', 'anna', '${folder.id}', 'file', 'notes.txt', 5, 1, 1)`);
	assert.equal((await move("anna", { ids: [folder.id], driveId: drive.id })).status, 200);
	const owners = Object.fromEntries(f.sql.prepare(`SELECT id, owner_id, parent_id, r2_key FROM drive_items WHERE id IN ('${folder.id}', 'inside')`).all().map(row => [row.id, row]));
	assert.equal(owners[folder.id].owner_id, drive.id);
	assert.equal(owners[folder.id].parent_id, null);
	assert.equal(owners.inside.owner_id, drive.id);
	// The stored object keeps the key it was written under.
	assert.equal(owners.inside.r2_key, "drive/anna/inside");
	const folders = await (await foldersRoute.GET(f.request("anna", `/api/drive/folders?drive=${drive.id}`))).json();
	assert.deepEqual(folders.folders.map(entry => entry.name), ["Brief"]);

	// Within the drive an editor can reorganise; taking things out is for managers.
	const other = (await (await itemsRoute.POST(f.request("anna", "/api/drive/items", "POST", { name: "Archive", driveId: drive.id }))).json()).item;
	assert.equal((await move("anna", { ids: [folder.id], parentId: other.id })).status, 200);
	assert.equal((await move("anna", { ids: [folder.id] })).status, 403);
	assert.equal((await getDriveItem(f.db, folder.id)).ownerId, drive.id);
	assert.equal((await move("ben", { ids: [folder.id] })).status, 200);
	assert.equal((await getDriveItem(f.db, folder.id)).ownerId, "ben");
	assert.equal((await getDriveItem(f.db, "inside")).ownerId, "ben");

	// Nobody moves things into another person's files, and a full drive refuses more.
	const cara = (await (await itemsRoute.POST(f.request("cara", "/api/drive/items", "POST", { name: "Cara's" }))).json()).item;
	assert.equal((await move("ben", { ids: [folder.id], parentId: cara.id })).status, 404);
	await driveRoute.PATCH(f.request("primary", `/api/drives/${drive.id}`, "PATCH", { storageLimitBytes: 1 }), context(drive.id));
	assert.equal((await move("ben", { ids: [folder.id], driveId: drive.id })).status, 413);
});

test("admins see every drive, deleted ones too, and can restore one", async () => {
	const f = await fixture();
	const drive = await f.createDrive("Archive");
	assert.equal((await adminDrivesRoute.GET(f.request("anna", "/api/shared-drives"))).status, 403);
	await driveRoute.DELETE(f.request("primary", `/api/drives/${drive.id}`, "DELETE"), context(drive.id));
	const listed = (await (await adminDrivesRoute.GET(f.request("primary", "/api/shared-drives"))).json()).drives;
	assert.deepEqual(listed.map(entry => [entry.name, entry.deleted, entry.peopleCount, entry.managerCount]), [["Archive", true, 1, 1]]);
	assert.ok(listed[0].purgeAt);
	assert.equal((await restoreRoute.POST(f.request("anna", `/api/shared-drives/${drive.id}/restore`, "POST"), context(drive.id))).status, 403);
	assert.equal((await restoreRoute.POST(f.request("primary", `/api/shared-drives/${drive.id}/restore`, "POST"), context(drive.id))).status, 200);
	assert.deepEqual((await (await drivesRoute.GET(f.request("primary", "/api/drives"))).json()).drives.map(entry => entry.name), ["Archive"]);
});
