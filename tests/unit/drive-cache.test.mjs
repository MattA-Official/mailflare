import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll as after, test } from "vitest";
import { build } from "./helpers/esbuild.mjs";
import { JSDOM } from "jsdom";

const project = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const directory = mkdtempSync(join(project, "node_modules", "drive-cache-test-"));
after(() => rmSync(directory, { recursive: true, force: true }));
await build({
	// drive-cache.ts is part of drive-utils.ts here.
	entryPoints: [join(project, "app/utils/drive/drive-utils.ts")],
	outfile: join(directory, "drive-cache.mjs"), bundle: true, platform: "node", format: "esm", logLevel: "silent",
	plugins: [{ name: "mock-auth", setup(builder) {
		builder.onResolve({ filter: /^~\/utils\/auth-client$/ }, () => ({ path: "auth", namespace: "mock" }));
		builder.onLoad({ filter: /.*/, namespace: "mock" }, () => ({
			contents: `export const AUTH_SESSION_CHANGED_EVENT = "auth-changed";`,
			loader: "js",
		}));
	} }],
});
const cacheUrl = pathToFileURL(join(directory, "drive-cache.mjs")).href;

test("drive listings are dropped when the session changes", async () => {
	const dom = new JSDOM("<!doctype html>");
	globalThis.window = dom.window;
	try {
		const cache = await import(`${cacheUrl}?run=${Math.random()}`);
		const listing = { items: [{ id: "a" }], path: [], role: "owner", storageUsed: 1, storageLimit: null };
		cache.saveDriveListing("my|||", listing);
		assert.equal(cache.readDriveListing("my|||"), listing);
		window.dispatchEvent(new window.Event("auth-changed"));
		assert.equal(cache.readDriveListing("my|||"), undefined);
	} finally {
		dom.window.close();
		delete globalThis.window;
	}
});
