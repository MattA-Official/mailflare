import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterAll as after, test, onTestFinished } from "vitest";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "./helpers/esbuild.mjs";

// The outbound consumer claims a job ("sending") before delivering it. Anything
// that can fail and be retried has to happen before the claim, or the retry sees
// a non-queued job and skips it for good.

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const directory = mkdtempSync(join(root, "node_modules", "mailflare-outbound-claim-"));
after(() => rmSync(directory, { recursive: true, force: true }));
await build({
	stdin: { contents: `
		export { SqliteDatabase } from "./tests/unit/helpers/sqlite-database.mjs";
		export { applyMigrations } from "./tests/unit/helpers/migrate.mjs";
		export { processOutboundQueue } from "./server/lib/email/send.ts";
	`, resolveDir: root, sourcefile: "entry.ts" },
	outfile: join(directory, "entry.mjs"), bundle: true, platform: "node", format: "esm", target: "node24",
	tsconfig: join(root, "tsconfig.json"), packages: "external", logLevel: "silent",
	alias: { "cloudflare:workers": "./tests/unit/helpers/cloudflare-workers.mjs" },
});
const { SqliteDatabase, applyMigrations, processOutboundQueue } = await import(pathToFileURL(join(directory, "entry.mjs")).href);

test("a transient attachment read failure leaves the scheduled send for the retry", async (t) => {
	const database = new SqliteDatabase(":memory:");
	onTestFinished(() => database.db.close());
	await applyMigrations(database, join(root, "server/db/migrations/sqlite"));
	const due = Math.floor(Date.now() / 1000) - 60;
	database.db.exec(`
		INSERT INTO users (id, email, password_hash, name, role, is_primary_admin, created_at) VALUES ('u', 'me@one.test', 'h', 'Me', 'admin', 1, 1);
		INSERT INTO messages (id, user_id, direction, from_addr, to_addr, subject, status, read, created_at)
			VALUES ('msg', 'u', 'outbound', 'me@one.test', 'you@ext.test', 's', 'queued', 1, 1);
		INSERT INTO message_attachments (id, message_id, filename, content_type, size, r2_key, created_at)
			VALUES ('att', 'msg', 'a.pdf', 'application/pdf', 3, 'attachments/att', 1);
		INSERT INTO outbound_jobs (id, user_id, message_id, status, payload, scheduled_at, created_at, updated_at)
			VALUES ('job', 'u', 'msg', 'queued', '{"from":"me@one.test","to":["you@ext.test"],"subject":"s","mailboxId":"box","userId":"u"}', ${due}, 1, 1);
	`);
	let failures = 1;
	const env = { DB: database, BUCKET: { get: async () => { if (failures-- > 0) throw new Error("R2 503"); return { arrayBuffer: async () => new ArrayBuffer(3) }; } } };
	const payload = { kind: "email.scheduled", jobId: "job", messageId: "msg", scheduledAt: new Date(due * 1000).toISOString() };
	await assert.rejects(processOutboundQueue(env, payload), /R2 503/); // queue will retry this
	await processOutboundQueue(env, payload).catch(() => {}); // the retry
	const job = database.db.prepare("SELECT status FROM outbound_jobs WHERE id = 'job'").get();
	const msg = database.db.prepare("SELECT status FROM messages WHERE id = 'msg'").get();
	assert.notEqual(job.status, "sending", `job stuck in "sending" with message ${msg.status}`);
});
