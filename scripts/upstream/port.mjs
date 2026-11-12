#!/usr/bin/env node
// Helper for porting upstream (hieunc229/mailflare) commits onto the Nuxt port.
//
//   node scripts/upstream/port.mjs status            what is unported, sorted into what the script can
//                                                    carry across and what needs porting by hand
//   node scripts/upstream/port.mjs apply [<sha>]     carry the server side across, up to <sha> (default:
//                                                    origin/upstream), with a three-way merge
//   node scripts/upstream/port.mjs mark <sha>        record <sha> as the last ported commit
//
// The last ported commit is the `<!-- upstream-ported: <sha> -->` marker in docs/PORTING.md. `apply`
// maps upstream paths onto this tree (src/lib -> server/lib, src/app/api -> server/handlers/api,
// drizzle/migrations -> server/db/migrations/sqlite, tests -> tests/unit, ...), skips files the fork
// deleted on purpose, rewrites `@/` and `next/*` imports to the #lib/#db/#handlers aliases, converts
// new or changed tests to vitest, and regenerates the migration bundle and route stubs. Conflicts are
// left as conflict markers for a person (or Claude) to resolve. The UI (React under src/app and
// src/components) is never applied: it is listed for porting to Vue by hand.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const UPSTREAM_URL = "https://github.com/hieunc229/mailflare.git";
const PORTING = "docs/PORTING.md";
const MARKER = /<!-- upstream-ported: ([0-9a-f]{40}) -->/;

/** Upstream path prefix -> this repository's. Order matters: the first match wins. */
const PATH_MAP = [
	["src/lib/", "server/lib/"],
	["src/db/", "server/db/"],
	["src/app/api/", "server/handlers/api/"],
	["src/app/jmap/", "server/handlers/jmap/"],
	["src/app/mcp/", "server/handlers/mcp/"],
	["src/app/.well-known/", "server/handlers/well-known/"],
	["drizzle/migrations/", "server/db/migrations/sqlite/"],
	["tests/", "tests/unit/"],
	["public/", "public/"],
];

/** Upstream paths that are not ported at all (dropped features, other dialects, generated files). */
const IGNORED = [
	/^drizzle\/migrations-(pg|mysql)\//,
	/^server\/runtime\//,
	/^deploy\//,
	/^docker|^Dockerfile|^\.dockerignore/,
	/^src\/lib\/migrations\/bundle(-[a-z]+)?\.json$/,
	/^tests\/e2e\//,
	/^(package(-lock)?\.json|bun\.lockb?|tsconfig\.json|next\.config\.|vite\.config\.|wrangler\.|\.github\/)/,
];

/** Upstream paths whose changes need a hand port: the React UI and the Worker entry. */
const MANUAL = [/^src\/app\/(?!api\/|jmap\/|mcp\/|\.well-known\/)/, /^src\/(components|hooks)\//, /^worker(-utils)?\.ts$/, /^env\.d\.ts$/];

function git(...args) {
	return execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }).trimEnd();
}

function lastPorted() {
	const match = MARKER.exec(readFileSync(PORTING, "utf8"));
	if (!match) throw new Error(`No <!-- upstream-ported: <sha> --> marker in ${PORTING}`);
	return match[1];
}

function fetchUpstream() {
	// The fork's `upstream` branch is kept in step by .github/workflows/sync-upstream.yml; the original
	// repository is fetched too so a run never waits on that workflow.
	try { git("fetch", "--quiet", "origin", "upstream"); } catch { /* offline or no branch: use what is there */ }
	try {
		git("fetch", "--quiet", "--no-tags", UPSTREAM_URL, "main");
		return git("rev-parse", "FETCH_HEAD");
	} catch {
		return git("rev-parse", "origin/upstream");
	}
}

function mapPath(path) {
	for (const [from, to] of PATH_MAP) if (path.startsWith(from)) return to + path.slice(from.length);
	return null;
}

function classify(from, to) {
	const rows = git("diff", "--name-status", "--no-renames", from, to).split("\n").filter(Boolean);
	const result = { auto: [], manual: [], ignored: [], unmapped: [], dropped: [] };
	for (const row of rows) {
		const [status, path] = row.split("\t");
		if (IGNORED.some((pattern) => pattern.test(path))) result.ignored.push(`${status} ${path}`);
		else if (MANUAL.some((pattern) => pattern.test(path))) result.manual.push(`${status} ${path}`);
		else {
			const target = mapPath(path);
			if (!target) result.unmapped.push(`${status} ${path}`);
			// A file the fork deleted on purpose stays deleted.
			else if (status !== "A" && !existsSync(target)) result.dropped.push(`${status} ${path}`);
			else result.auto.push({ status, path, target });
		}
	}
	return result;
}

function status() {
	const from = lastPorted();
	const to = fetchUpstream();
	const log = git("log", "--reverse", "--format=%h %ad %s", "--date=short", `${from}..${to}`);
	console.log(`Last ported: ${from.slice(0, 7)}   upstream main: ${to.slice(0, 7)}`);
	if (!log) {
		console.log("Nothing to port.");
		return;
	}
	console.log(`\nUnported commits:\n${log}`);
	const result = classify(from, to);
	console.log(`\nCarried across by \`apply\` (${result.auto.length}):`);
	for (const item of result.auto) console.log(`  ${item.status} ${item.path} -> ${item.target}`);
	console.log(`\nPort by hand (${result.manual.length}):\n${result.manual.map((line) => `  ${line}`).join("\n")}`);
	if (result.dropped.length) console.log(`\nSkipped, deleted in the fork (${result.dropped.length}):\n${result.dropped.map((line) => `  ${line}`).join("\n")}`);
	if (result.unmapped.length) console.log(`\nNo mapping, decide by hand (${result.unmapped.length}):\n${result.unmapped.map((line) => `  ${line}`).join("\n")}`);
	if (result.ignored.length) console.log(`\nIgnored (${result.ignored.length}):\n${result.ignored.map((line) => `  ${line}`).join("\n")}`);
}

function rewriteImports(file) {
	if (!/\.(ts|mts|js|mjs|vue)$/.test(file) || file.startsWith("tests/") || !existsSync(file)) return;
	const before = readFileSync(file, "utf8");
	const after = before
		.replace(/(["'])@\/db(["'/])/g, "$1#db$2")
		.replace(/(["'])@\/lib\//g, "$1#lib/")
		.replace(/(["'])@\/app\/api\//g, "$1#handlers/api/")
		.replace(/"next\/(server|headers)"/g, '"#lib/http/next-compat"');
	if (after !== before) writeFileSync(file, after);
}

function apply(target) {
	const from = lastPorted();
	const to = target ? git("rev-parse", target) : fetchUpstream();
	const result = classify(from, to);
	if (result.auto.length === 0) {
		console.log("No server-side changes to carry across.");
		return;
	}
	const paths = result.auto.map((item) => item.path);
	let patch = git("diff", "--binary", "--full-index", "--no-renames", from, to, "--", ...paths);
	// Rewrite the paths on the header lines only; hunks stay as they are.
	patch = patch.split("\n").map((line) => {
		if (!/^(diff --git|--- |\+\+\+ )/.test(line)) return line;
		return line.replace(/(a\/|b\/)(\S+)/g, (whole, side, path) => side + (mapPath(path) ?? path));
	}).join("\n") + "\n";
	const dir = mkdtempSync(join(tmpdir(), "mailflare-upstream-"));
	const file = join(dir, "server.patch");
	writeFileSync(file, patch);
	let conflicts = "";
	try {
		execFileSync("git", ["apply", "--3way", "--index", file], { stdio: ["ignore", "inherit", "inherit"] });
	} catch {
		conflicts = git("diff", "--name-only", "--diff-filter=U");
		if (!conflicts) throw new Error("git apply failed without leaving conflicts; see the output above");
	}
	const touched = result.auto.map((item) => item.target);
	for (const path of touched) rewriteImports(path);
	const tests = touched.filter((path) => /^tests\/unit\/[^/]+\.test\.mjs$/.test(path) && existsSync(path));
	if (tests.length) execFileSync("node", ["scripts/upstream/port-test.mjs", ...tests], { stdio: "inherit" });
	execFileSync("bun", ["run", "prepare:gen"], { stdio: "inherit" });
	console.log(`\nCarried ${touched.length} file(s) across from ${from.slice(0, 7)}..${to.slice(0, 7)}.`);
	if (conflicts) console.log(`\nResolve the conflict markers in:\n${conflicts.split("\n").map((line) => `  ${line}`).join("\n")}\nMost are import lines: keep upstream's side, with #lib/#db aliases.`);
	console.log(`\nPort by hand (${result.manual.length}):\n${result.manual.map((line) => `  ${line}`).join("\n")}`);
	if (result.unmapped.length) console.log(`\nNo mapping, decide by hand:\n${result.unmapped.map((line) => `  ${line}`).join("\n")}`);
	console.log(`\nWhen done: node scripts/upstream/port.mjs mark ${to}`);
}

function mark(sha) {
	if (!/^[0-9a-f]{7,40}$/.test(sha ?? "")) throw new Error("mark needs a commit sha");
	const full = git("rev-parse", `${sha}^{commit}`);
	const source = readFileSync(PORTING, "utf8");
	if (!MARKER.test(source)) throw new Error(`No marker in ${PORTING}`);
	const subject = git("log", "-1", "--format=%s (%ad)", "--date=short", full);
	writeFileSync(PORTING, source
		.replace(MARKER, `<!-- upstream-ported: ${full} -->`)
		.replace(/(Last ported upstream commit: )`[0-9a-f]{7,40}`[^\n]*/, `$1\`${full.slice(0, 7)}\` ${subject.replace(/\$/g, "$$$$")}`));
	console.log(`Recorded ${full.slice(0, 7)} as the last ported upstream commit in ${PORTING}.`);
}

const [command, argument] = process.argv.slice(2);
if (command === "status") status();
else if (command === "apply") apply(argument);
else if (command === "mark") mark(argument);
else {
	console.error("Usage: node scripts/upstream/port.mjs status | apply [<sha>] | mark <sha>");
	process.exit(1);
}
