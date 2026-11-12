// Ported from legacy/tests/send-view-status.test.mjs against app/composables/messages/useSendViewStatus.ts.
// Upstream mounted the hook in a React root; here the composable runs in a Vue effect scope, with
// useRoute/useRouter (Nuxt auto-imports) stood in for by a reactive route and a replace spy.
import assert from "node:assert/strict";
import { afterAll, onTestFinished, test } from "vitest";
import { JSDOM } from "jsdom";
import { effectScope, nextTick, reactive, toValue, watch } from "vue";
import { importAppModule } from "./helpers/app-module.mjs";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://mail.example/" });
const route = reactive({ path: "/" });
const router = { replace(destination) { globalThis.__sendViewReplace(destination); } };
Object.assign(globalThis, { window: dom.window, Event: dom.window.Event, watch, toValue, useRoute: () => route, useRouter: () => router });
afterAll(() => {
	dom.window.close();
	for (const name of ["window", "Event", "watch", "toValue", "useRoute", "useRouter", "__sendViewReplace", "__sendViewFetch", "__sendViewClearCache"]) delete globalThis[name];
});

const mocks = new Map([
	["~/utils/auth-client", "export function authFetch(...args) { return globalThis.__sendViewFetch(...args); }"],
	["~/utils/messages/detail-cache", "export function clearMessageDetailCache() { globalThis.__sendViewClearCache(); }"],
]);
const { useSendViewStatus } = await importAppModule({
	entry: "app/composables/messages/useSendViewStatus.ts",
	name: "send-view-status",
	plugins: [{
		name: "send-view-status-mocks",
		setup(builder) {
			builder.onResolve({ filter: /^~\/utils\// }, args => (mocks.has(args.path) ? { path: args.path, namespace: "send-view-status-mock" } : undefined));
			builder.onLoad({ filter: /.*/, namespace: "send-view-status-mock" }, args => ({ contents: mocks.get(args.path), loader: "js" }));
		},
	}],
});

async function settle() {
	for (let turn = 0; turn < 3; turn++) await new Promise(resolve => setImmediate(resolve));
	await nextTick();
}

async function mountReader(messageId) {
	route.path = globalThis.__sendViewPathname;
	const scope = effectScope();
	scope.run(() => useSendViewStatus(messageId));
	await settle();
	return { async unmount() { scope.stop(); } };
}

async function messagesChanged() {
	window.dispatchEvent(new window.Event("mailflare:messages-changed"));
	await settle();
}

function statusResponse(status, ok = true) {
	return { ok, status: ok ? 200 : 500, json: async () => ({ status }) };
}

/** Installs mutable pathname, stable-router replace spy, controlled fetch and cache-clear spy. */
function prepare({ pathname, responses = [] }) {
	const calls = [];
	const replacements = [];
	const cleared = [];
	const queue = [...responses];
	globalThis.__sendViewPathname = pathname;
	globalThis.__sendViewReplace = destination => { replacements.push(destination); };
	globalThis.__sendViewFetch = async (url, init) => {
		calls.push({ url: String(url), cache: init?.cache });
		if (queue.length === 0) throw new Error(`unexpected status request for ${url}`);
		const next = queue.shift();
		return typeof next === "function" ? next() : next;
	};
	globalThis.__sendViewClearCache = () => { cleared.push(true); };
	return { calls, replacements, cleared, queue };
}

function trackMessagesChanged() {
	const seen = [];
	const listener = () => { seen.push("changed"); };
	window.addEventListener("mailflare:messages-changed", listener);
	onTestFinished(() => window.removeEventListener("mailflare:messages-changed", listener));
	return seen;
}

test("a scheduled reader navigates to the sent reader after confirmed delivery and clears its cache", async () => {
	const view = prepare({ pathname: "/scheduled/msg-1", responses: [statusResponse("sent")] });
	const changes = trackMessagesChanged();
	const reader = await mountReader("msg-1");
	onTestFinished(() => reader.unmount());

	assert.deepEqual(view.calls, [{ url: "/api/messages/msg-1/send-status", cache: "no-store" }]);
	assert.deepEqual(view.replacements, ["/sent/msg-1"]);
	assert.equal(view.cleared.length, 1, "the reader's detail cache is cleared before the move");
	assert.deepEqual(changes, ["changed"], "listeners learn the message list needs to refresh");
	assert.equal(view.calls.length, 1, "the emitted change event does not fetch again after moving");
});

test("a messages-changed event re-checks a scheduled reader until delivery is confirmed", async () => {
	const view = prepare({
		pathname: "/scheduled/msg-2",
		responses: [statusResponse("queued"), statusResponse("sent")],
	});
	const reader = await mountReader("msg-2");
	onTestFinished(() => reader.unmount());

	assert.equal(view.calls.length, 1);
	assert.deepEqual(view.replacements, [], "a queued message stays in the scheduled reader");

	await messagesChanged();

	assert.equal(view.calls.length, 2);
	assert.deepEqual(view.replacements, ["/sent/msg-2"]);
	assert.equal(view.cleared.length, 1);
});

for (const [pathname, destination] of [
	["/scheduled/msg-draft", "/scheduled"],
	["/sent/msg-draft", "/sent"],
]) {
	test(`a draft status closes the ${pathname.startsWith("/scheduled/") ? "scheduled" : "sent"} reader`, async () => {
		const view = prepare({ pathname, responses: [statusResponse("draft")] });
		const changes = trackMessagesChanged();
		const reader = await mountReader("msg-draft");
		onTestFinished(() => reader.unmount());

		assert.deepEqual(view.replacements, [destination]);
		assert.equal(view.cleared.length, 1);
		assert.deepEqual(changes, ["changed"]);
	});
}

test("folder lists and unrelated message routes never request status or navigate", async () => {
	for (const pathname of ["/scheduled", "/sent", "/inbox", "/scheduled/other-id", "/sent/other-id", "/inbox/msg-3"]) {
		const view = prepare({ pathname, responses: [] });
		const reader = await mountReader("msg-3");
		await reader.unmount();

		assert.equal(view.calls.length, 0, `${pathname} does not poll`);
		assert.deepEqual(view.replacements, [], `${pathname} does not navigate`);
		assert.equal(view.cleared.length, 0, `${pathname} does not clear a cache`);
	}
});

test("a status response resolved after unmount cannot navigate or clear the cache", async () => {
	let resolveFetch;
	const view = prepare({
		pathname: "/scheduled/msg-inflight",
		responses: [() => new Promise(resolve => { resolveFetch = resolve; })],
	});
	const changes = trackMessagesChanged();
	const reader = await mountReader("msg-inflight");
	assert.equal(view.calls.length, 1);

	await reader.unmount();
	resolveFetch(statusResponse("sent"));
	await new Promise(resolve => setImmediate(resolve));
	await new Promise(resolve => setImmediate(resolve));

	assert.deepEqual(view.replacements, []);
	assert.equal(view.cleared.length, 0);
	assert.deepEqual(changes, []);
});
