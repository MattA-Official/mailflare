import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "vitest";
import { fileURLToPath } from "node:url";
import { loadApp } from "./helpers/real-db.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const api = join(root, "server", "handlers", "api");

// Every cookie-authenticated handler resolves its user through getCurrentUser (server/lib/auth/cookies.ts),
// which refuses a state-changing request whose origin is not the app's own. Bearer tokens are exempt.
const { app } = await loadApp("mutation-origin", `
	export { getCurrentUser, requireUser } from "./server/lib/auth/cookies.ts";
	export { isSameOriginRequest } from "./server/lib/auth/origin.ts";`, {
	mocks: {
		"#lib/http/next-compat": "export async function cookies(){return {get:(name)=>name==='ep_session'?{value:'tok'}:undefined}}",
		"#lib/auth/session": "export const SESSION_COOKIE='ep_session'; export async function getUserFromSession(env, token){return token==='tok'||token==='bearer'?{id:'u1',disabled:false}:null}",
	},
});
const call = (method, headers = {}) => app.getCurrentUser({}, new Request("https://mail.example.com/api/x", { method, headers }));

test("a cookie session is refused on a mutation from another origin", async () => {
	for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
		assert.equal(await call(method), null, `${method} without origin headers`);
		assert.equal(await call(method, { Origin: "https://evil.example.net" }), null);
		assert.equal(await call(method, { "Sec-Fetch-Site": "same-site" }), null, "sibling subdomain");
		assert.equal(await call(method, { "Sec-Fetch-Site": "cross-site" }), null);
		assert.ok(await call(method, { "Sec-Fetch-Site": "same-origin" }), `${method} same-origin`);
		assert.ok(await call(method, { Origin: "https://mail.example.com" }), `${method} matching Origin`);
	}
});

test("reads and bearer-token requests are unaffected", async () => {
	assert.ok(await call("GET"));
	assert.ok(await call("GET", { "Sec-Fetch-Site": "cross-site" }));
	assert.ok(await call("POST", { Authorization: "Bearer bearer" }));
	await assert.rejects(app.requireUser({}, new Request("https://mail.example.com/api/x", { method: "POST" })));
});

// On the Node server Next builds request.url from the bind address, so the expected origin comes from
// APP_URL, or from Host plus a trusted x-forwarded-proto, never from request.url.
// (fork) Workers only: upstream also checks its self-hosted Node server's APP_URL and Host handling.
test("a request with neither Origin nor Sec-Fetch-Site is refused", async () => {
	assert.equal(await call("POST"), null);
	assert.equal(await call("POST", { "Sec-Fetch-Site": "none" }), null);
});

test("the account switcher uses the same strict check, with no bearer or missing-Origin exemption", () => {
	const strict = (headers) => app.isSameOriginRequest(new Request("https://mail.example.com/api/auth/switch", { method: "POST", headers }));
	assert.equal(strict({}), false);
	assert.equal(strict({ Authorization: "Bearer x" }), false);
	assert.equal(strict({ Origin: "https://mail.example.com" }), true);
	assert.equal(strict({ Origin: "https://evil.example.com" }), false);
});

// Handlers that never authenticate with the session cookie, so the origin rule does not apply to them.
const EXEMPT = {
	"v1/": "API-key bearer surface (authenticateApiKey / authenticateAdminApiKey); browsers never attach the key",
	"accounts/[id]/mailbox-access/route.ts": "stub that answers 410 and does nothing",
	"auth/device/route.ts": "mobile sign-in by credentials in the body; DELETE authenticates with a device key",
	"mobile/push/route.ts": "device key bearer token",
	"public/booking/[eventId]/route.ts": "public booking form, designed to be posted from external pages",
	"auth/login/route.ts": "pre-session credential endpoint (Turnstile and password), no cookie authority to ride",
	"auth/register/route.ts": "pre-session sign-up (Turnstile / setup token)",
	"auth/password-reset/request/route.ts": "pre-session, Turnstile protected",
	"auth/password-reset/confirm/route.ts": "pre-session, proves a single-use emailed token",
	"auth/mfa/verify/route.ts": "pre-session, proves a login challenge token",
	"auth/passkey/mfa/options/route.ts": "pre-session login challenge",
	"auth/passkey/mfa/verify/route.ts": "pre-session login challenge",
	"auth/passkey/options/route.ts": "pre-session passkey sign-in",
	"auth/passkey/verify/route.ts": "pre-session passkey sign-in",
	"auth/passkey/setup/options/route.ts": "pre-session, proves a single-use enrolment grant",
	"auth/passkey/setup/verify/route.ts": "pre-session, proves a single-use enrolment grant",
	"setup/domain/route.ts": "first-run setup, only works before any account exists",
	"setup/domain/mx/route.ts": "first-run setup, only works before any account exists",
	"setup/prepare/route.ts": "first-run setup, refuses a database that already has tables",
	"seed/route.ts": "development seeding, refuses outside a fresh dev database",
};
const exemptReason = (relative) => Object.entries(EXEMPT).find(([prefix]) => relative === prefix || (prefix.endsWith("/") && relative.startsWith(prefix)))?.[1];
// Handlers that read the session cookie themselves instead of through getCurrentUser must carry their own check.
const OWN_CHECK = ["auth/logout/route.ts", "auth/switch/route.ts", "auth/accounts/route.ts"];

function* walk(directory) {
	for (const name of readdirSync(directory)) {
		const path = join(directory, name);
		if (statSync(path).isDirectory()) yield* walk(path);
		else if (name.endsWith(".ts") && !name.endsWith(".d.ts")) yield path;
	}
}
const METHODS = /export\s+(?:async\s+function|const)\s+(POST|PUT|PATCH|DELETE)\b|export\s*\{([^}]*)\}/g;
function mutationExports(source) {
	const found = new Set();
	for (const match of source.matchAll(METHODS)) {
		if (match[1]) found.add(match[1]);
		else for (const name of match[2].split(",")) { const method = name.trim().split(/\s+as\s+/).pop(); if (/^(POST|PUT|PATCH|DELETE)$/.test(method)) found.add(method); }
	}
	return found;
}
const resolveImport = (file, specifier) => {
	const alias = { "#lib/": "server/lib/", "#handlers/": "server/handlers/", "#db/": "server/db/" };
	const prefix = Object.keys(alias).find((key) => specifier.startsWith(key));
	const base = prefix ? join(root, alias[prefix], specifier.slice(prefix.length)) : specifier === "#db" ? join(root, "server/db") : specifier.startsWith(".") ? resolve(dirname(file), specifier) : null;
	return base && [`${base}.ts`, join(base, "index.ts")].find((candidate) => existsSync(candidate));
};
/**
 * The handler's own source, the modules it re-exports from (route.ts -> POST.ts), and the modules those
 * import directly (its route utils). Deliberately shallow: a guarded resolver call buried several layers
 * deep in unrelated code does not prove this handler is guarded.
 */
function handlerSource(file, seen = new Set()) {
	if (seen.has(file)) return "";
	seen.add(file);
	const source = readFileSync(file, "utf8");
	let all = source;
	for (const [, specifier] of source.matchAll(/export\s*(?:\*|\{[^}]*\})\s*from\s+"([^"]+)"/g)) {
		const target = resolveImport(file, specifier);
		if (target) all += handlerSource(target, seen);
	}
	for (const [, specifier] of source.matchAll(/^import[^;]*?from\s+"([^"]+)"/gm)) {
		const target = resolveImport(file, specifier);
		if (target && !seen.has(target)) { seen.add(target); all += readFileSync(target, "utf8"); }
	}
	return all;
}
const handlers = [...walk(api)].map((file) => ({ file, relative: file.slice(api.length + 1).replaceAll("\\", "/") }))
	.map((entry) => ({ ...entry, methods: [...mutationExports(readFileSync(entry.file, "utf8"))] }))
	.filter((entry) => entry.methods.length);

test("the exemption list names real handlers", () => {
	for (const prefix of Object.keys(EXEMPT)) {
		assert.ok(handlers.some((entry) => entry.relative === prefix || (prefix.endsWith("/") && entry.relative.startsWith(prefix))), `${prefix} has no mutation handler`);
	}
});

test("every cookie-authenticated mutation handler resolves its user through the guarded session helper", () => {
	assert.ok(handlers.length > 100, "the walk found the handlers");
	const resolver = /\b(getCurrentUser|requireUser|requireSessionUser|authorizeAdminRequest)\(/;
	const problems = [];
	for (const { file, relative, methods } of handlers) {
		if (exemptReason(relative)) continue;
		const text = readFileSync(file, "utf8");
		if (OWN_CHECK.includes(relative)) {
			if (!/hasValidSessionMutationOrigin\(request\)|isSameOriginRequest\(request\)/.test(text)) problems.push(`${relative} (${methods}) reads the cookie itself and needs its own origin check`);
		} else {
			if (!resolver.test(handlerSource(file))) problems.push(`${relative} (${methods}) neither uses the guarded session helper nor is exempt: classify it`);
			if (/jar\.get\(SESSION_COOKIE\)/.test(text)) problems.push(`${relative} reads the session cookie directly`);
		}
	}
	assert.deepEqual(problems, []);
});

test("the admin wrapper counted as a guarded resolver really calls requireUser, and the weak same-origin helper is gone", () => {
	assert.match(readFileSync(join(api, "admin", "migrations", "utils.ts"), "utf8"), /export async function authorizeAdminRequest[\s\S]*?requireUser\(env, request\)/);
	assert.doesNotMatch(readFileSync(join(root, "server", "lib", "auth", "accounts.ts"), "utf8"), /isSameOrigin\b/);
	for (const file of walk(api)) assert.doesNotMatch(readFileSync(file, "utf8"), /headers\.get\("Origin"\)\s*!==\s*new URL\(request\.url\)\.origin/, `${file} compares Origin to request.url itself`);
});
