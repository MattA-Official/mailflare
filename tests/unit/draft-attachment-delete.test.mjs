import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterAll as after, test, onTestFinished } from "vitest";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "./helpers/esbuild.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outDir = mkdtempSync(join(root, "tests", ".tmp-draft-attachment-delete-"));
after(() => rmSync(outDir, { recursive: true, force: true }));

await build({
	stdin: {
		contents: `
			export { deleteMessageAttachment } from "./server/lib/email/attachments";
		`,
		resolveDir: root,
		loader: "ts",
	},
	outfile: join(outDir, "attachments.mjs"),
	bundle: true,
	platform: "node",
	format: "esm",
	target: "node22",
	external: ["better-sqlite3", "drizzle-orm", "drizzle-orm/*"],
	logLevel: "silent",
});
await build({
	entryPoints: {
		database: join(root, "tests/unit/helpers/sqlite-database.mjs"),
		migrate: join(root, "tests/unit/helpers/migrate.mjs"),
	},
	outdir: outDir,
	outExtension: { ".js": ".mjs" },
	bundle: true,
	platform: "node",
	format: "esm",
	target: "node22",
	external: ["better-sqlite3", "drizzle-orm", "drizzle-orm/*"],
	logLevel: "silent",
});

const load = (name) => import(pathToFileURL(join(outDir, `${name}.mjs`)).href);
const { deleteMessageAttachment } = await load("attachments");
const { SqliteDatabase } = await load("database");
const { applyMigrations } = await load("migrate");

async function fixture(t, { sharedWithDrive }) {
	const database = new SqliteDatabase(join(outDir, `${crypto.randomUUID()}.sqlite`));
	onTestFinished(() => database.db.close());
	await applyMigrations(database, join(root, "server/db/migrations/sqlite"));
	const now = Math.floor(Date.now() / 1000);
	const run = (sql, ...params) => database.db.prepare(sql).run(...params);
	run("INSERT INTO users (id, email, name, password_hash, created_at) VALUES ('u', 'u@example.com', 'U', 'x', ?)", now);
	run("INSERT INTO domains (id, user_id, hostname, zone_id, created_at) VALUES ('d', 'u', 'example.com', 'zone', ?)", now);
	run("INSERT INTO mailboxes (id, user_id, domain_id, local_part, type, created_at) VALUES ('mb', 'u', 'd', 'me', 'personal', ?)", now);
	run("INSERT INTO messages (id, mailbox_id, user_id, direction, from_addr, to_addr, subject, status, created_at) VALUES ('draft', 'mb', 'u', 'outbound', 'me@example.com', 'a@b.test', 's', 'draft', ?)", now);
	run("INSERT INTO message_attachments (id, message_id, filename, content_type, size, r2_key, created_at) VALUES ('att', 'draft', 'a.pdf', 'application/pdf', 3, 'attachments/k1', ?)", now);
	if (sharedWithDrive) {
		run("INSERT INTO drive_items (id, owner_id, kind, name, r2_key, size, created_at, updated_at) VALUES ('item', 'u', 'file', 'a.pdf', 'attachments/k1', 3, ?, ?)", now, now);
	}
	const deleted = [];
	const env = { DB: database, BUCKET: { delete: async (keys) => { deleted.push(...(Array.isArray(keys) ? keys : [keys])); } } };
	return { env, deleted };
}

test("removing a draft attachment deletes its object when nothing else uses it", async (t) => {
	const { env, deleted } = await fixture(t, { sharedWithDrive: false });
	assert.equal(await deleteMessageAttachment(env, "draft", "att"), true);
	assert.deepEqual(deleted, ["attachments/k1"]);
});

test("removing a draft attachment keeps an object a Drive item still points at", async (t) => {
	const { env, deleted } = await fixture(t, { sharedWithDrive: true });
	assert.equal(await deleteMessageAttachment(env, "draft", "att"), true);
	assert.deepEqual(deleted, []);
});
