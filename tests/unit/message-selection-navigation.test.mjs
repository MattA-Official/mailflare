// Ported from legacy/tests/message-selection-navigation.test.mjs against
// app/components/messages/SplitLayout.vue. Upstream rendered the whole inbox in React; here the real
// split layout is compiled and mounted in jsdom, and the list (MessagesFolderPage), the routed page
// (NuxtPage) and the reader's bulk bar are small stubs that read and write the list state the layout
// provides. What is under test is the layout's part: selection and page live above the routed page,
// survive opening a message, and the bulk bar shows only beside a visible split list.
import assert from "node:assert/strict";
import { afterAll, onTestFinished, test } from "vitest";
import { bundleAppModule, installDom, installVueAutoImports, vuePlugin } from "./helpers/app-module.mjs";

const { cleanup: cleanupDom } = await installDom("https://mail.example/inbox");
const storage = new Map();
globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) };
globalThis.sessionStorage = globalThis.localStorage;

const mocks = new Map([
	["~/composables/messages/useConversationView", "import { ref } from 'vue'; export function useConversationView() { return [ref(true), () => {}]; }"],
	["~/composables/messages/useTwoColumnReading", "import { ref } from 'vue'; export function useTwoColumnReading() { return [ref(true), () => {}]; }"],
	["@vueuse/core", "import { ref } from 'vue'; export function useMediaQuery() { return ref(globalThis.__testIsDesktop !== false); }"],
]);
const url = await bundleAppModule({
	name: "message-selection",
	contents: `
		export { default as SplitLayout } from "./app/components/messages/SplitLayout.vue";
		export { useMessageListState, useMessageDetailNavigationContext } from "./app/composables/messages/useMessageListContext.ts";
		export * as vue from "vue";
	`,
	plugins: [{
		name: "message-selection-mocks",
		setup(builder) {
			builder.onResolve({ filter: /^(~\/composables\/messages\/use(ConversationView|TwoColumnReading)|@vueuse\/core)$/ }, args => ({ path: args.path, namespace: "selection-mock" }));
			builder.onLoad({ filter: /.*/, namespace: "selection-mock" }, args => ({ contents: mocks.get(args.path), loader: "js", resolveDir: process.cwd() }));
		},
	}, vuePlugin],
});
// useMessageListContext builds a computed at load, so the auto-imports go in before the bundle loads.
const removeAutoImports = installVueAutoImports(await import("vue"));
const { SplitLayout, useMessageListState, useMessageDetailNavigationContext, vue } = await import(url);
assert.equal(vue.ref, globalThis.ref, "the test and the bundle share one Vue");
const { createApp, defineComponent, h, nextTick, reactive, ref } = vue;

const route = reactive({ path: "/inbox", params: {} });
function navigate(path) {
	route.path = path;
	route.params = path.startsWith("/inbox/") ? { messageId: path.slice("/inbox/".length) } : {};
}
Object.assign(globalThis, {
	useRoute: () => route,
	useLanguage: () => ({ t: (key, vars) => (vars && vars.count !== undefined ? `${key}:${vars.count}` : key) }),
	useMailSearch: () => ({ query: ref("") }),
	useSelectedMailbox: () => ({ selectedMailbox: ref({ id: "mb1" }), isLoading: ref(false) }),
	authFetch: async () => Response.json({ messages: [], hasNewer: false, hasOlder: false }),
});
afterAll(() => {
	removeAutoImports();
	for (const name of ["useRoute", "useLanguage", "useMailSearch", "useSelectedMailbox", "authFetch", "localStorage", "sessionStorage", "__testIsDesktop"]) delete globalThis[name];
	cleanupDom();
});

const PAGE_SIZE = 25;
const inbox = Array.from({ length: 30 }, (_, index) => ({ id: `m${index + 1}`, read: false }));

// The list: a header checkbox, one checkbox per row on the current page, and paging.
const FolderPage = defineComponent({
	setup() {
		const state = useMessageListState();
		return () => {
			const page = inbox.slice(state.offset.value, state.offset.value + PAGE_SIZE);
			const selected = new Set(state.selectedMessages.value.map(message => message.id));
			return h("div", { "data-testid": "message-list" }, [
				h("input", { type: "checkbox", "aria-label": "list.selectAll" }),
				...page.map(message => h("input", {
					type: "checkbox",
					checked: selected.has(message.id),
					onClick: () => {
						state.selectedMessages.value = selected.has(message.id)
							? state.selectedMessages.value.filter(item => item.id !== message.id)
							: [...state.selectedMessages.value, message];
					},
				})),
				h("button", { type: "button", "aria-label": "list.nextPage", onClick: () => { state.offset.value += PAGE_SIZE; } }),
			]);
		};
	},
});

// The routed page: the inbox list, or the reader with the split view's bulk bar above it.
const NuxtPage = defineComponent({
	setup() {
		const state = useMessageListState();
		const navigation = useMessageDetailNavigationContext();
		return () => {
			const messageId = route.params.messageId;
			if (!messageId) return h(FolderPage);
			return h("div", [
				navigation.showBulkBar.value
					? h("div", { role: "region" }, [
						`common.selectedCount:${state.selectedMessages.value.length}`,
						h("button", { type: "button", "aria-label": "common.clearSelection", onClick: () => { state.selectedMessages.value = []; } }),
					])
					: null,
				h("div", { "data-testid": "message-detail", "data-message-id": messageId }, "Message detail"),
			]);
		};
	},
});

async function renderInbox({ desktop = true } = {}) {
	globalThis.__testIsDesktop = desktop;
	navigate("/inbox");
	const container = document.createElement("div");
	document.body.appendChild(container);
	const app = createApp({ render: () => h(SplitLayout, { config: { folder: "inbox", hrefPrefix: "/inbox", title: "Inbox" } }) });
	app.component("MessagesFolderPage", FolderPage);
	app.component("NuxtPage", NuxtPage);
	app.mount(container);
	onTestFinished(() => {
		app.unmount();
		container.remove();
	});
	await nextTick();
	return container;
}

const checkedBoxes = container => Array.from(container.querySelectorAll('input[type="checkbox"]')).filter(input => input.checked);

async function act(callback) {
	callback();
	await nextTick();
	await new Promise(resolve => setImmediate(resolve));
	await nextTick();
}

test("opening a message keeps the selection made while no message was open", async () => {
	const container = await renderInbox();
	await act(() => container.querySelectorAll('input[type="checkbox"]')[1].click());
	assert.equal(checkedBoxes(container).length, 1, "the row is selected before opening a message");

	await act(() => navigate("/inbox/m1"));
	assert.equal(checkedBoxes(container).length, 1, "the sidebar list keeps the selected row");
	assert.ok(container.querySelector('[data-testid="message-detail"]'), "the focused message stays visible");
	assert.match(container.textContent, /common\.selectedCount:1/, "the bulk action bar reports one selected message");

	const clearSelection = container.querySelector('button[aria-label="common.clearSelection"]');
	assert.ok(clearSelection, "the bulk action bar offers a way to clear the selection");
	await act(() => clearSelection.click());
	assert.ok(container.querySelector('[data-testid="message-detail"]'), "clearing the selection keeps the message visible");
	assert.equal(checkedBoxes(container).length, 0, "clearing the selection unchecks the sidebar row");
	assert.doesNotMatch(container.textContent, /common\.selectedCount:1/, "the bulk action bar disappears");
});

test("opening a message keeps the selection on a page other than the first", async () => {
	const container = await renderInbox();
	const nextPage = container.querySelector('button[aria-label="list.nextPage"]');
	assert.ok(nextPage, "the first page has a next-page button");
	await act(() => nextPage.click());

	await act(() => container.querySelectorAll('input[type="checkbox"]')[1].click());
	assert.equal(checkedBoxes(container).length, 1, "a row on the second page is selected");

	await act(() => navigate("/inbox/m26"));
	assert.equal(checkedBoxes(container).length, 1, "the sidebar list stays on the same page and keeps the selected row");
	assert.ok(container.querySelector('[data-testid="message-detail"]'), "the focused message stays visible on the second page too");
});

test("the focused-message bulk bar stays in the split view", async () => {
	const container = await renderInbox({ desktop: false });
	await act(() => container.querySelectorAll('input[type="checkbox"]')[1].click());

	await act(() => navigate("/inbox/m1"));
	assert.ok(container.querySelector('[data-testid="message-detail"]'), "single-column reading still opens the message");
	assert.equal(container.querySelector('[data-testid="message-list"]'), null, "single-column reading hides the list");
	assert.equal(container.querySelector('[role="region"]'), null, "the bulk bar is hidden without a visible split list");

	await act(() => navigate("/inbox"));
	assert.equal(checkedBoxes(container).length, 1, "the selection survives");
});
