// The Vue half of legacy/tests/i18n.test.mjs: upstream rendered its React LanguageProvider,
// LanguageSelector and root layout on the server. The port renders on the client only (ssr: false),
// so app/composables/useLanguage.ts takes the locale from the cookie at start (the language plugin
// calls initLanguage), sets <html lang dir> itself, and the selector (AppLanguageSelect) lists
// useLanguage().locales and calls setLocale. These cases check that path in jsdom.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeEach, test } from "vitest";
import { bundleAppModule, installDom, installVueAutoImports } from "./helpers/app-module.mjs";
import { root } from "./helpers/paths.mjs";

const { dom, cleanup } = await installDom("https://mail.example/inbox");
globalThis.location = dom.window.location;
const removeAutoImports = installVueAutoImports(await import("vue"));
const testCatalogs = {};
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input) => {
	const path = new URL(String(input), "https://mail.example").pathname;
	const code = path.match(/^\/locales\/([\w-]+)\.json$/)?.[1];
	if (code && testCatalogs[code]) return Response.json(testCatalogs[code]);
	const file = join(root, "public", path);
	return existsSync(file) ? new Response(readFileSync(file)) : new Response("Not found", { status: 404 });
};
afterAll(() => {
	globalThis.fetch = originalFetch;
	delete globalThis.location;
	removeAutoImports();
	cleanup();
});

const languageUrl = await bundleAppModule({ entry: "app/composables/useLanguage.ts", name: "language" });
const extendedUrl = await bundleAppModule({
	entry: "app/composables/useLanguage.ts",
	name: "language-extra-locale",
	plugins: [{
		name: "extra-locale",
		setup(builder) {
			builder.onLoad({ filter: /[\\/]i18n[\\/]locales\.ts$/ }, ({ path }) => ({
				contents: readFileSync(path, "utf8").replace("export const locales = {", `export const locales = {
					he: { label: "Testlandic", dir: "rtl" },`),
				loader: "ts",
			}));
		},
	}],
});
let run = 0;
const freshLanguage = (url = languageUrl) => import(`${url}?run=${++run}`);

beforeEach(() => {
	document.cookie = "mailflare-locale=; Max-Age=0; Path=/";
	document.documentElement.removeAttribute("lang");
	document.documentElement.removeAttribute("dir");
});

test("start-up takes the cookie locale for <html> and the translator on first paint", async () => {
	document.cookie = "mailflare-locale=pt-BR; Path=/";
	const { initLanguage, useLanguage } = await freshLanguage();
	await initLanguage();
	assert.equal(document.documentElement.lang, "pt-BR");
	assert.equal(document.documentElement.dir, "ltr");
	assert.equal(useLanguage().locale.value, "pt-BR");
	assert.equal(useLanguage().t("navigation.inbox"), "Entrada");
});

test("a missing or invalid cookie falls back to the browser language, then English", async () => {
	for (const cookie of [null, "bad"]) {
		if (cookie) document.cookie = `mailflare-locale=${cookie}; Path=/`;
		const { initLanguage, useLanguage } = await freshLanguage();
		await initLanguage();
		assert.equal(document.documentElement.lang, "en", String(cookie));
		assert.equal(useLanguage().t("navigation.inbox"), "Inbox");
	}
});

test("the selector offers every registered locale and choosing one persists it and relabels the page", async () => {
	const { initLanguage, useLanguage } = await freshLanguage();
	await initLanguage();
	const language = useLanguage();
	const { locales } = await import("../../server/lib/i18n/locales.ts");
	assert.deepEqual(Object.keys(language.locales), Object.keys(locales));
	await language.setLocale("pt-BR");
	assert.match(document.cookie, /mailflare-locale=pt-BR/);
	assert.equal(document.documentElement.lang, "pt-BR");
	assert.equal(language.locale.value, "pt-BR");
	assert.equal(language.t("navigation.inbox"), "Entrada");
});

test("a locale registered once reaches the selector, the cookie, <html lang dir> and the translator", async () => {
	const en = JSON.parse(readFileSync(join(root, "server/lib/i18n/en.json"), "utf8"));
	testCatalogs.he = { ...en, "navigation.inbox": "Entrada", "navigation.inbox.one": "{count} entrada", "navigation.inbox.other": "{count} entradas" };
	document.cookie = "mailflare-locale=he; Path=/";
	const { initLanguage, useLanguage } = await freshLanguage(extendedUrl);
	await initLanguage();
	const language = useLanguage();
	assert.equal(language.locales.he?.label, "Testlandic");
	assert.equal(document.documentElement.lang, "he");
	assert.equal(document.documentElement.dir, "rtl");
	assert.equal(language.dir.value, "rtl");
	assert.equal(language.t("navigation.inbox"), "Entrada");
	assert.equal(language.t("navigation.inbox", { count: 3 }), "3 entradas");
	await language.setLocale("he");
	assert.match(document.cookie, /mailflare-locale=he/);
});
