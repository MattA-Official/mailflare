// Ported from legacy/tests/sender-check-notice.test.mjs against
// app/components/messages/SenderCheckNotice.vue, compiled with vue/compiler-sfc and mounted in jsdom.
// The live region carries role="status" only when the reader asks it to announce (`announce`), and
// Vue leaves a comment where the button is not rendered and an empty class on the region, so the
// rendered HTML drops both before comparing.
import assert from "node:assert/strict";
import { afterAll, test } from "vitest";
import { bundleAppModule, installDom, installVueAutoImports, vuePlugin } from "./helpers/app-module.mjs";

const { cleanup } = await installDom();
const url = await bundleAppModule({
	name: "sender-check-notice",
	contents: `
		export { default as SenderCheckNotice } from "./app/components/messages/SenderCheckNotice.vue";
		export * as vue from "vue";
		export { defaultTranslator } from "#lib/i18n/utils";
	`,
	plugins: [{
		name: "authentication-state",
		setup(builder) {
			builder.onResolve({ filter: /useMessageAuthentication$/ }, () => ({ path: "authentication", namespace: "mock" }));
			builder.onLoad({ filter: /.*/, namespace: "mock" }, () => ({
				contents: "import { computed } from 'vue'; export function useMessageAuthentication() { return { authentication: computed(() => globalThis.testSenderAuthentication) }; }",
				loader: "js",
				resolveDir: process.cwd(),
			}));
		},
	}, vuePlugin],
});
const { SenderCheckNotice, vue, defaultTranslator } = await import(url);
const removeAutoImports = installVueAutoImports(vue);
globalThis.useLanguage = () => ({ t: defaultTranslator });
afterAll(() => {
	removeAutoImports();
	delete globalThis.useLanguage;
	delete globalThis.testSenderAuthentication;
	cleanup();
});

function render(message, detailsOpen = false, authentication = null) {
	globalThis.testSenderAuthentication = authentication;
	const container = document.createElement("div");
	const app = vue.createApp({ render: () => vue.h(SenderCheckNotice, { message, detailsOpen, announce: true }) });
	app.component("UIcon", { props: ["name"], render() { return vue.h("span", { class: this.$attrs.class }); } });
	app.mount(container);
	const html = container.innerHTML.replace(/<!--[\s\S]*?-->/g, "").replaceAll(' class=""', "");
	app.unmount();
	return html;
}

const message = { id: "test", direction: "inbound", fromAddr: '"security@bank.test" <alerts@other.test>', replyTo: "help@third.test" };

test("sender notice is one compact disclosure without duplicated warning reasons", () => {
	const html = render(message);
	assert.match(html, /<button[^>]*aria-expanded="false"/);
	assert.match(html, /Sender checks need attention/);
	assert.doesNotMatch(html, /<ul|<li|sender name contains|Replies to this message|Review sender details|Be cautious/);
});

test("sender notice stays available when details are open", () => {
	const html = render(message, true);
	assert.match(html, /<button[^>]*aria-expanded="true"/);
	assert.match(html, /rotate-180/);
});

test("clean messages retain an empty live region for late authentication warnings", () => {
	const clean = { ...message, fromAddr: "help@example.test", replyTo: null };
	assert.equal(render(clean), '<div role="status"></div>');
	assert.match(render(clean, false, { available: true, dmarc: { status: "FAIL" } }), /<button/);
	assert.doesNotMatch(render({ ...message, direction: "outbound" }), /<button/);
});
