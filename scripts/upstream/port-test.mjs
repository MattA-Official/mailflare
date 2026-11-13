#!/usr/bin/env node
// Rewrites upstream node:test files (tests/*.test.mjs) in place into this repo's vitest layout
// (tests/unit/*.test.mjs). Mechanical only: imports, paths and the runtime stand-ins. Anything that
// tests dropped features (other databases, other providers, the Node runtime) still needs a hand edit.
//
//   node scripts/upstream/port-test.mjs tests/unit/foo.test.mjs [...]
import { readFileSync, writeFileSync } from "node:fs";

const rules = [
	// vitest instead of node:test
	[/^import test, \{ after \} from "node:test";$/m, 'import { afterAll as after, test, onTestFinished } from "vitest";'],
	[/^import test, \{ ([^}]+) \} from "node:test";$/m, 'import { test, onTestFinished, $1 } from "vitest";'],
	[/^import test from "node:test";$/m, 'import { test, onTestFinished } from "vitest";'],
	[/\bt\.after\(/g, "onTestFinished("],
	// node:test's t.mock.method(object, "name", impl) -> vi.spyOn; vitest.config restores mocks between tests
	[/\b(?:t|context)\.mock\.method\(([^,]+), (["'][^"']+["']), /g, "vi.spyOn($1, $2).mockImplementation("],
	// esbuild through the helper that knows the #lib/#db/#handlers aliases
	[/^import \{ build \} from "esbuild";$/m, 'import { build } from "./helpers/esbuild.mjs";'],
	[/^import \* as esbuild from "esbuild";$/m, 'import * as esbuild from "./helpers/esbuild.mjs";'],
	// tests/unit is one level deeper than upstream's tests/
	[/(const root = join\(dirname\(fileURLToPath\(import\.meta\.url\)\), "\.\.")\)/, '$1, "..")'],
	// upstream layout -> this repo's
	[/(["'`(/.])src\/app\/api\//g, "$1server/handlers/api/"],
	[/(["'`(/.])src\/app\/jmap\//g, "$1server/handlers/jmap/"],
	[/(["'`(/.])src\/app\/mcp\//g, "$1server/handlers/mcp/"],
	[/(["'`(/.])src\/app\/\.well-known\//g, "$1server/handlers/well-known/"],
	[/(["'`(/.])src\/lib\//g, "$1server/lib/"],
	[/(["'`(/.])src\/db\b/g, "$1server/db"],
	[/server\/runtime\/sqlite-database(\.ts)?/g, "tests/unit/helpers/sqlite-database.mjs"],
	[/server\/runtime\/migrate(\.ts)?/g, "tests/unit/helpers/migrate.mjs"],
	[/server\/runtime\/cloudflare-workers(\.ts)?/g, "tests/unit/helpers/cloudflare-workers.mjs"],
	// module ids in mocks and plugins
	[/(["'])@\/lib\//g, "$1#lib/"],
	[/(["'])@\/db(["'/])/g, "$1#db$2"],
	[/(["'])@\/app\/api\//g, "$1#handlers/api/"],
	[/"drizzle\/migrations"/g, '"server/db/migrations/sqlite"'],
	[/join\(root, "worker-utils\.ts"\)/g, 'join(root, "server/worker/utils.ts")'],
	// the helper resolves aliases; upstream's tsconfig and next/* shims do not exist here
	[/^\s*tsconfig: join\(root, "tsconfig\.json"\),\n/gm, ""],
	[/\s*"@": join\(root, "src"\),?/g, ""],
	[/\s*"next\/headers": "next\/headers\.js",?/g, ""],
	[/\s*"next\/server": "next\/server\.js",?/g, ""],
	[/^\s*alias: \{\s*\},\n/gm, ""],
];

for (const file of process.argv.slice(2)) {
	let source = readFileSync(file, "utf8");
	for (const [pattern, replacement] of rules) source = source.replace(pattern, replacement);
	// drop onTestFinished from the import when the file never calls it
	if (!/onTestFinished\(/.test(source)) source = source.replace(/, onTestFinished(?=[,} ])/, "");
	// add vi to the vitest import when a rule introduced it
	if (/\bvi\.spyOn\(/.test(source) && !/import \{[^}]*\bvi\b[^}]*\} from "vitest"/.test(source)) source = source.replace(/ \} from "vitest";/, ', vi } from "vitest";');
	writeFileSync(file, source);
}
