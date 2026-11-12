import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterAll as after, test } from "vitest";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "./helpers/esbuild.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outDir = mkdtempSync(join(root, "tests", ".tmp-sqlite-defaults-"));
after(() => rmSync(outDir, { recursive: true, force: true }));

await build({
	entryPoints: [join(root, "tests/unit/helpers/sqlite-database.mjs")],
	outfile: join(outDir, "entry.mjs"),
	bundle: true,
	platform: "node",
	format: "esm",
	target: "node22",
	external: ["better-sqlite3"],
	logLevel: "silent",
});

// Upstream also checked the Node runtime's SQLite pragmas, which went with the Node runtime. The D1
// stand-in these tests use is checked here instead.
const { SqliteDatabase } = await import(pathToFileURL(join(outDir, "entry.mjs")).href);

test("upstream sqlite setup does not mention a private mailbox size or host cache knobs", () => {
	const source = readFileSync(join(root, "tests/unit/helpers/sqlite-database.mjs"), "utf8");
	assert.equal(source.includes("13GB"), false);
	const route = readFileSync(join(root, "server/handlers/api/messages/route.ts"), "utf8");
	assert.equal(route.includes("13GB"), false);
	assert.equal(route.includes("maxScan"), false);
});

test("cached reads switch between raw arrays and named row objects", async () => {
	const database = new SqliteDatabase(":memory:");
	try {
		const query = "SELECT ? AS value";
		assert.deepEqual(await database.prepare(query).bind("raw").raw(), [["raw"]]);
		assert.deepEqual(await database.prepare(query).bind("first").first(), { value: "first" });
		assert.deepEqual(await database.prepare(query).bind("raw-again").raw(), [["raw-again"]]);
		assert.equal(await database.prepare(query).bind("column").first("value"), "column");
		assert.deepEqual(await database.prepare(query).bind("raw-before-all").raw(), [["raw-before-all"]]);
		assert.deepEqual((await database.prepare(query).bind("all").all()).results, [{ value: "all" }]);
		assert.deepEqual(await database.prepare(query).bind("last-raw").raw(), [["last-raw"]]);
	} finally {
		database.db.close();
	}
});
