import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll as after, test } from "vitest";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "./helpers/esbuild.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outDir = mkdtempSync(join(tmpdir(), "mailflare-i18n-"));
after(() => rmSync(outDir, { recursive: true, force: true }));
const outfile = join(outDir, "i18n.mjs");

// Catalogs other than English are static assets; tests serve them from public/ for both the browser
// `fetch` and the server's ASSETS binding. `testCatalogs` adds in-memory catalogs for an isolated locale.
globalThis.testCatalogs = {};
globalThis.readTestAsset = async (input) => {
	const path = new URL(String(input), "https://mailflare.local").pathname;
	const code = path.match(/^\/locales\/([\w-]+)\.json$/)?.[1];
	if (code && globalThis.testCatalogs[code]) return Response.json(globalThis.testCatalogs[code]);
	const file = join(root, "public", path);
	return existsSync(file) ? new Response(readFileSync(file)) : new Response("Not found", { status: 404 });
};
globalThis.fetch = globalThis.readTestAsset;

async function bundleI18n(outfile, extraLocale = false) {
	await build({
		stdin: {
			contents: `
				export * from "./server/lib/i18n/utils";
				export * from "./server/lib/i18n/locales";
			`,
			resolveDir: root,
			loader: "ts",
		},
		outfile,
		bundle: true,
		platform: "node",
		format: "esm",
		target: "node22",
		logLevel: "silent",
		banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
		plugins: [{
			name: "extra-locale",
			setup(builder) {
				if (extraLocale) builder.onLoad({ filter: /[\\/]i18n[\\/]locales\.ts$/ }, ({ path }) => ({
					contents: readFileSync(path, "utf8").replace("export const locales = {", `export const locales = {
						he: { label: "Testlandic", dir: "rtl" },`),
					loader: "ts",
				}));
			},
		}],
	});
}
await bundleI18n(outfile);

const i18n = await import(pathToFileURL(outfile).href);
const en = JSON.parse(readFileSync(join(root, "server/lib/i18n/en.json"), "utf8"));

const CATEGORIES = ["zero", "one", "two", "few", "many", "other"];
const categoryOf = (key) => CATEGORIES.find((category) => key.endsWith(`.${category}`));
const baseOf = (key) => categoryOf(key) ? key.slice(0, key.lastIndexOf(".")) : key;
const placeholders = (text) => [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]))].sort();
// A plural group is `base.other` plus any other CLDR categories; catalogs may carry the categories their language needs.
const pluralBases = new Set(Object.keys(en).filter((key) => key.endsWith(".other")).map(baseOf));
const isPluralKey = (key) => categoryOf(key) && pluralBases.has(baseOf(key));

// Upstream lands new English strings before their translations (its own catalogues lag by a few dozen
// keys), and t() falls back to English for a missing key. So a catalogue may lack keys, but never carry
// one English does not have.
test("every registered catalog has only English keys and nonempty messages and label", async () => {
	for (const [code, { label }] of Object.entries(i18n.locales)) {
		const catalog = await i18n.loadMessages(code);
		assert.ok(label.trim().length > 0, code);
		const plain = (keys) => keys.filter((key) => !isPluralKey(key)).sort();
		const unknown = plain(Object.keys(catalog)).filter((key) => !(key in en));
		assert.deepEqual(unknown, [], `${code}: keys English does not have`);
		for (const key of Object.keys(catalog)) {
			if (isPluralKey(key)) assert.ok(`${baseOf(key)}.other` in catalog, `${code}: ${key} has no .other`);
			const value = catalog[key];
			assert.ok(typeof value === "string" && value.trim().length > 0, `${code}: ${key} is empty`);
			const reference = isPluralKey(key) ? en[`${baseOf(key)}.other`] : en[key];
			// A plural variant may drop {count} ("this message"), but never invent a placeholder.
			const allowed = placeholders(reference);
			const used = placeholders(value);
			if (isPluralKey(key)) assert.ok(used.every((name) => allowed.includes(name)), `${code}: ${key} uses an unknown {placeholder}`);
			else assert.deepEqual(used, allowed, `${code}: ${key} changes its {placeholders}`);
		}
	}
});

test("missing, invalid and unsupported locale values fall back to English", () => {
	for (const value of [undefined, null, "", "not-a-registered-locale", "pt-BR; Path=/", {}]) assert.equal(i18n.resolveLocale(value), "en");
	assert.equal(i18n.resolveLocale("en"), "en");
	assert.equal(i18n.resolveLocale("pt-BR"), "pt-BR");
});

test("translation uses the requested catalog and falls back per key", async () => {
	assert.equal(i18n.translate(await i18n.loadMessages("pt-BR"), "navigation.inbox"), "Entrada");
	assert.equal(i18n.translate({}, "navigation.inbox"), "Inbox");
});

test("existing locale-specific plural translations remain available", async () => {
	const catalog = await i18n.loadMessages("pl");
	assert.equal(catalog["thread.attachmentCount.few"], "{count} załączniki");
	assert.equal(i18n.createTranslator("pl", catalog)("thread.attachmentCount", { count: 3 }), "3 załączniki");
});

test("preference cookie persists for a year, covers every path and is Secure on HTTPS", () => {
	assert.equal(i18n.serializeLocaleCookie("pt-BR", true), "mailflare-locale=pt-BR; Path=/; Max-Age=31536000; SameSite=Lax; Secure");
	assert.equal(i18n.serializeLocaleCookie("en", false), "mailflare-locale=en; Path=/; Max-Age=31536000; SameSite=Lax");
	assert.equal(i18n.serializeLocaleCookie("bad; Domain=example.com", true), "mailflare-locale=en; Path=/; Max-Age=31536000; SameSite=Lax; Secure");
});

// Upstream also rendered the React language provider, selector and root layout here; the Vue
// equivalents are covered in i18n-language.test.mjs.
test("a locale registered once reaches resolution, translation and cookie", async () => {
	assert.ok(existsSync(join(root, "server/lib/i18n/locales.ts")), "locales must have one shared registry");
	// Use an ICU-supported locale absent from the registry. Unknown codes such as
	// xx fall back to the host locale, which may not have a "one" plural category.
	assert.equal(Object.hasOwn(i18n.locales, "he"), false);
	globalThis.testCatalogs.he = { ...en, "navigation.inbox": "Entrada", "navigation.inbox.one": "{count} entrada", "navigation.inbox.other": "{count} entradas", "language.label": "Idioma" };
	const extraFile = join(outDir, "with-spanish.mjs");
	await bundleI18n(extraFile, true);
	const extended = await import(pathToFileURL(extraFile).href);
	assert.equal(extended.resolveLocale("he"), "he");
	assert.equal(extended.translate(await extended.loadMessages("he"), "navigation.inbox"), "Entrada");
	assert.match(extended.serializeLocaleCookie("he", true), /^mailflare-locale=he;/);
	assert.equal(extended.getDirection("he"), "rtl");
	const t = extended.createTranslator("he", await extended.loadMessages("he"));
	assert.equal(t("navigation.inbox", { count: 1 }), "1 entrada");
	assert.equal(t("navigation.inbox", { count: 3 }), "3 entradas");
	assert.equal(t("navigation.inbox"), "Entrada");
	for (const invalid of ["constructor", "toString", "__proto__"]) {
		assert.equal(extended.resolveLocale(invalid), "en");
	}
});

test("translations interpolate {vars}, keep unknown placeholders and default to ltr", async () => {
	assert.equal(i18n.translate({ "navigation.inbox": "Hi {name}, {other}" }, "navigation.inbox", { name: "Ana", count: 2 }), "Hi Ana, {other}");
	assert.equal(i18n.translate({}, "navigation.inbox", { name: "x" }), "Inbox");
	assert.equal(i18n.createTranslator("pt-BR", await i18n.loadMessages("pt-BR"))("navigation.inbox", { count: 2 }), "Entrada");
	assert.equal(i18n.getDirection("en"), "ltr");
});
