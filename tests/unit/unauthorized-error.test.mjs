import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterAll as after, test } from "vitest";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "./helpers/esbuild.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const directory = mkdtempSync(join(root, "node_modules", "mailflare-unauthorized-"));
after(() => rmSync(directory, { recursive: true, force: true }));
await build({
	entryPoints: [join(root, "server/lib/auth/unauthorized.ts")],
	outfile: join(directory, "entry.mjs"),
	bundle: true,
	platform: "node",
	format: "esm",
	target: "node24",
	logLevel: "silent",
});
const { UnauthorizedError } = await import(pathToFileURL(join(directory, "entry.mjs")).href);

// Upstream checks vinext's route policy. Here defineNextRoute (server/utils/next-route.ts)
// answers 401 for any escaped Error whose message is "Unauthorized".
test("an escaped UnauthorizedError carries the message defineNextRoute answers with 401", async () => {
	const error = new UnauthorizedError();
	assert.ok(error instanceof Error);
	assert.equal(error.message, "Unauthorized");
	const { readFileSync } = await import("node:fs");
	assert.match(readFileSync(join(root, "server/utils/next-route.ts"), "utf8"), /error\.message === 'Unauthorized'/);
});
