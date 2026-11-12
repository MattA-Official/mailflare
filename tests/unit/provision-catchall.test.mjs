import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

// Upstream skipped the Worker catch-all on its Node runtime (issue #42). This fork runs only as a
// Worker, so provisioning always binds the catch-all once Email Routing is enabled.

test("provisioning enables Email Routing and binds the Worker catch-all exactly once", () => {
	const src = stripComments(read("server/lib/domains/provision.ts"));
	const call = "await ensureEmailRoutingCatchAllToWorker(env, zone.id);";
	const idx = src.indexOf(call);
	assert.notEqual(idx, -1, "provisioning must call ensureEmailRoutingCatchAllToWorker");
	assert.equal(src.indexOf(call, idx + 1), -1, "exactly one catch-all bind call");
	assert.ok(src.indexOf("enableEmailRouting(") !== -1 && src.indexOf("enableEmailRouting(") < idx);
	assert.ok(!/isNodeRuntime|shouldBindEmailCatchAllToWorker/.test(src), "no Node runtime gate remains");
});

test("the catch-all helper has no runtime gate", () => {
	const catchAll = read("server/lib/domains/catch-all-routing.ts");
	assert.ok(!/\bisNodeRuntime\b/.test(catchAll));
	assert.match(catchAll, /export async function ensureEmailRoutingCatchAllToWorker/);
});
