import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll } from "vitest";
import { build } from "./esbuild.mjs";
import { root } from "./paths.mjs";

/**
 * Bundles a module from the Vue app (`app/`) with esbuild and returns its file URL, for tests ported
 * from upstream's node:test suite. Nuxt's auto-imports (`authFetch`, `ref`, `AUTH_SESSION_CHANGED_EVENT`
 * and so on) are left as free identifiers, so a test provides them on `globalThis` before calling in;
 * `import.meta.client` is true. Pass `contents` to bundle an entry written inline, or `entry` (a path
 * relative to the repository root). Packages stay external; a test's `plugins` run before the aliases.
 * Import the URL with a `?run=...` suffix to get a fresh copy of module state. The bundle is deleted
 * after the file's tests, so call this at the top level of a test file.
 */
export async function bundleAppModule({ entry, contents, name = "app-module", plugins = [], define = {}, external, cleanupAfterAll = true } = {}) {
	const directory = mkdtempSync(join(root, "node_modules", `mailflare-${name}-`));
	if (cleanupAfterAll) afterAll(() => rmSync(directory, { recursive: true, force: true }));
	const outfile = join(directory, "entry.mjs");
	await build({
		...(contents
			? { stdin: { contents, resolveDir: root, sourcefile: `${name}-entry.ts`, loader: "ts" } }
			: { entryPoints: [join(root, entry)] }),
		outfile,
		bundle: true,
		platform: "node",
		format: "esm",
		target: "node24",
		packages: "external",
		external,
		define: { "import.meta.client": "true", "import.meta.server": "false", "import.meta.dev": "false", ...define },
		plugins,
		logLevel: "silent",
	});
	return pathToFileURL(outfile).href;
}

/**
 * Bundles and imports an app module once (see `bundleAppModule`), deleting the bundle as soon as it
 * has loaded, so it can also be called from inside a test.
 */
export async function importAppModule(options) {
	const url = await bundleAppModule({ ...options, cleanupAfterAll: false });
	try {
		return await import(url);
	} finally {
		rmSync(dirname(fileURLToPath(url)), { recursive: true, force: true });
	}
}

/**
 * esbuild plugin compiling Vue single-file components with `vue/compiler-sfc`, so a test can bundle a
 * component and mount it in jsdom. Styles are dropped. Nuxt resolves auto-imported components at build
 * time; here they compile to `resolveComponent(...)`, so the test registers stubs on its app with
 * `app.component(name, stub)`. Auto-imported functions stay free identifiers (see `bundleAppModule`).
 */
export const vuePlugin = {
	name: "mailflare-vue-sfc",
	setup(builder) {
		builder.onLoad({ filter: /\.vue$/ }, async ({ path }) => {
			const { readFile } = await import("node:fs/promises");
			const { parse, compileScript } = await import("vue/compiler-sfc");
			const source = await readFile(path, "utf8");
			const { descriptor, errors } = parse(source, { filename: path });
			if (errors.length) return { errors: errors.map((error) => ({ text: String(error.message ?? error) })) };
			const id = path.replace(/[^a-z0-9]/gi, "").slice(-12);
			const script = compileScript(descriptor, { id, inlineTemplate: true, isProd: true });
			return { contents: script.content, loader: script.lang === "ts" ? "ts" : "js", resolveDir: dirname(path) };
		});
	},
};

/**
 * The Vue composition API names Nuxt auto-imports, copied from the given `vue` module onto globalThis.
 * Returns a function that removes them again.
 */
export function installVueAutoImports(vue) {
	const names = ["ref", "shallowRef", "computed", "reactive", "readonly", "watch", "watchEffect", "toValue", "toRef", "unref", "nextTick", "onMounted", "onBeforeUnmount", "onUnmounted", "useTemplateRef", "useId", "useSlots", "useAttrs", "provide", "inject", "h", "defineComponent"];
	for (const name of names) globalThis[name] = vue[name];
	return () => { for (const name of names) delete globalThis[name]; };
}

const DOM_GLOBALS = ["window", "document", "Document", "HTMLTextAreaElement", "HTMLSelectElement", "HTMLElement", "HTMLInputElement", "Element", "Node", "Text", "Event", "CustomEvent", "KeyboardEvent", "MouseEvent", "SVGElement", "DOMParser", "getComputedStyle"];

/**
 * Makes a jsdom window the global DOM (Vue's runtime reads `document` when it first loads, so call
 * this before importing a bundle that pulls in Vue). Returns the JSDOM and a cleanup function.
 */
export async function installDom(url = "https://mail.example/") {
	const { JSDOM } = await import("jsdom");
	const dom = new JSDOM("<!doctype html><html><body></body></html>", { url, pretendToBeVisual: true });
	for (const key of DOM_GLOBALS) globalThis[key] = key === "window" ? dom.window : dom.window[key];
	return {
		dom,
		cleanup() {
			dom.window.close();
			for (const key of DOM_GLOBALS) delete globalThis[key];
		},
	};
}
