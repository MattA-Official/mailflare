import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterAll as after, test, onTestFinished, vi } from "vitest";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "./helpers/esbuild.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * First-run setup on a self-hosted install with no Cloudflare credentials.
 * Skipping DNS must record the domain as manually managed (zone id "manual")
 * instead of calling the Cloudflare zone lookup. Issue #293.
 */
const directory = mkdtempSync(join(root, "node_modules", "mailflare-setup-skip-dns-"));
after(() => rmSync(directory, { recursive: true, force: true }));

await build({
	stdin: {
		contents: `
			export { SqliteDatabase } from "./tests/unit/helpers/sqlite-database.mjs";
			export { applyMigrations } from "./tests/unit/helpers/migrate.mjs";
			export { POST as setupDomain } from "./server/handlers/api/setup/domain/route.ts";
			export { POST as setupMx } from "./server/handlers/api/setup/domain/mx/route.ts";
			export { POST as register } from "./server/handlers/api/auth/register/route.ts";
		`,
		resolveDir: root,
		sourcefile: "setup-skip-dns-entry.ts",
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

const { SqliteDatabase, applyMigrations, setupDomain, setupMx, register } = await import(pathToFileURL(join(directory, "entry.mjs")).href);

function post(handler, path, body) {
	return handler(new Request(`https://mailflare.test${path}`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Origin: "https://mailflare.test" },
		body: JSON.stringify(body),
	}));
}

async function fixture(t) {
	const database = new SqliteDatabase(":memory:");
	onTestFinished(() => database.db.close());
	await applyMigrations(database, join(root, "server/db/migrations/sqlite"));
	const env = { DB: database, MAILFLARE_RUNTIME: "node", EMAIL: { configured: true } };
	globalThis.__mailflareNodeEnv = env;
	onTestFinished(() => { delete globalThis.__mailflareNodeEnv; });
	const calls = [];
	vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
		calls.push(String(url));
		throw new Error(`Cloudflare must not be contacted during skipped DNS setup: ${url}`);
	});
	return {
		database,
		calls,
		setupDomain: (body) => post(setupDomain, "/api/setup/domain", body),
		setupMx: (body) => post(setupMx, "/api/setup/domain/mx", body),
		register: (body) => post(register, "/api/auth/register", body),
	};
}

test("setup domain step with skipDns and no Cloudflare credentials returns a manual zone", async (t) => {
	const f = await fixture(t);
	const response = await f.setupDomain({ hostname: "Example.COM", skipDns: true });
	const body = await response.json();
	assert.equal(response.status, 200, JSON.stringify(body));
	assert.equal(body.domain.hostname, "example.com");
	assert.equal(body.domain.zone.id, "manual");
	assert.equal(body.domain.zone.name, "example.com");

	const mx = await f.setupMx({ hostname: "example.com", skipDns: true });
	const mxBody = await mx.json();
	assert.equal(mx.status, 200, JSON.stringify(mxBody));
	assert.equal(mxBody.hasExistingMx, false);
	assert.deepEqual(f.calls, []);
});

test("missing Cloudflare credentials are treated as a manual domain even when skipDns is omitted", async (t) => {
	const f = await fixture(t);
	const response = await f.setupDomain({ hostname: "example.com" });
	const body = await response.json();
	assert.equal(response.status, 200, JSON.stringify(body));
	assert.equal(body.domain.zone.id, "manual");

	const mx = await f.setupMx({ hostname: "example.com" });
	const mxBody = await mx.json();
	assert.equal(mx.status, 200, JSON.stringify(mxBody));
	assert.equal(mxBody.hasExistingMx, false);
	assert.deepEqual(f.calls, []);
});

test("skipDns skips the zone lookup even when a Cloudflare token is configured", async (t) => {
	const f = await fixture(t);
	globalThis.__mailflareNodeEnv.CF_TOKEN = "token-that-must-not-be-used";
	const response = await f.setupDomain({ hostname: "example.com", skipDns: true });
	const body = await response.json();
	assert.equal(response.status, 200, JSON.stringify(body));
	assert.equal(body.domain.zone.id, "manual");
	assert.deepEqual(f.calls, []);

	globalThis.__mailflareNodeEnv.CF_TOKEN = "token";
	const lookedUp = await f.setupDomain({ hostname: "example.com" });
	const lookedUpBody = await lookedUp.json();
	assert.equal(lookedUp.status, 502);
	assert.equal(f.calls.length, 1);
	assert.match(f.calls[0], /api\.cloudflare\.com/);
	assert.match(lookedUpBody.error, /api\.cloudflare\.com|Cloudflare/);
});

test("first-run setup domain plus register with skipDns records the domain as manually managed", async (t) => {
	const f = await fixture(t);
	const checked = await f.setupDomain({ hostname: "example.com", skipDns: true });
	const checkedBody = await checked.json();
	assert.equal(checked.status, 200, JSON.stringify(checkedBody));
	assert.equal(checkedBody.domain.zone.id, "manual");

	const created = await f.register({
		domain: "example.com",
		skipDns: true,
		enableSending: true,
		username: "ada",
		password: "correct-horse",
		resetEmail: "ada@personal.test",
	});
	const createdBody = await created.json();
	assert.equal(created.status, 200, JSON.stringify(createdBody));
	assert.equal(createdBody.ok, true);

	const domain = f.database.db.prepare("SELECT hostname, zone_id, dns_skipped, status FROM domains").get();
	assert.ok(domain, "domain row was not written");
	assert.equal(domain.hostname, "example.com");
	assert.equal(domain.zone_id, "manual");
	assert.equal(Number(domain.dns_skipped), 1);
	const user = f.database.db.prepare("SELECT email, role FROM users").get();
	assert.equal(user.email, "ada@example.com");
	assert.equal(user.role, "admin");
	const mailbox = f.database.db.prepare("SELECT local_part FROM mailboxes").get();
	assert.equal(mailbox.local_part, "ada");
	assert.deepEqual(f.calls, []);
});
