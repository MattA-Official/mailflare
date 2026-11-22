import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterAll as after, test, onTestFinished, vi } from "vitest";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "./helpers/esbuild.mjs";

// A forward rule without "keep a copy" only sends mail to the queue when the
// forward itself failed (server/worker.ts), so the queue must store it rather than drop it.
// (fork) Upstream drives this through its shared intakeIncomingMail; the fork's email handler
// lives in server/worker.ts, so the test queues the payload the handler would send.

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const directory = mkdtempSync(join(root, "node_modules", "mailflare-failed-forward-"));
after(() => rmSync(directory, { recursive: true, force: true }));
await build({
	stdin: {
		contents: `
			export { SqliteDatabase } from "./tests/unit/helpers/sqlite-database.mjs";
			export { applyMigrations } from "./tests/unit/helpers/migrate.mjs";
			export { processInboundMessage } from "./server/lib/email/inbound.ts";
		`,
		resolveDir: root,
		sourcefile: "failed-forward-entry.ts",
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
const { SqliteDatabase, applyMigrations, processInboundMessage } =
	await import(pathToFileURL(join(directory, "entry.mjs")).href);

const raw = new TextEncoder().encode("From: a@ext.test\r\nTo: x@one.test\r\nSubject: hi\r\nMessage-ID: <1@ext.test>\r\n\r\nbody\r\n").buffer;

async function setup(t) {
	const database = new SqliteDatabase(":memory:");
	onTestFinished(() => database.db.close());
	await applyMigrations(database, join(root, "server/db/migrations/sqlite"));
	database.db.exec(`
		INSERT INTO users (id, email, password_hash, name, role, is_primary_admin, created_at) VALUES ('admin', 'owner@one.test', 'hash', 'Owner', 'admin', 1, 1);
		INSERT INTO domains (id, user_id, hostname, zone_id, status, created_at) VALUES ('one', 'admin', 'one.test', 'z', 'active', 1);
		INSERT INTO mailboxes (id, user_id, domain_id, local_part, created_at) VALUES ('box', 'admin', 'one', 'me', 1);
		INSERT INTO routing_rules (id, user_id, domain_id, scope, mailbox_id, pattern, action, forward_to, keep_copy, enabled, priority, created_at)
			VALUES ('r', 'admin', 'one', 'domain', 'box', '*', 'forward', 'team@elsewhere.test', 0, 1, 10, 1);
	`);
	const objects = new Map();
	const queued = [];
	const env = {
		DB: database,
		BUCKET: {
			put: async (key, value) => { objects.set(key, value); },
			get: async (key) => objects.has(key) ? { arrayBuffer: async () => objects.get(key) } : null,
			head: async (key) => objects.has(key) ? {} : null,
			delete: async (key) => { objects.delete(key); },
		},
		INBOUND_QUEUE: { send: async (payload) => { queued.push(payload); } },
	};
	return { env, database, objects, queued };
}

test("a catch-all forward that failed is stored in the catch-all mailbox", async (t) => {
	vi.spyOn(console, "error").mockImplementation(() => {});
	vi.spyOn(console, "warn").mockImplementation(() => {});
	vi.spyOn(console, "info").mockImplementation(() => {});
	const { env, database, objects } = await setup(t);
	objects.set("inbound/failed-forward.eml", raw);
	await processInboundMessage(env, { from: "a@ext.test", to: "x@one.test", rawR2Key: "inbound/failed-forward.eml", headers: {} });
	const rows = database.db.prepare("SELECT mailbox_id, subject FROM messages").all();
	assert.deepEqual(rows.map((row) => ({ ...row })), [{ mailbox_id: "box", subject: "hi" }]);
});
