// Ported from legacy/tests/compose-ai-review-behavior.test.mjs against app/components/compose/Form.vue.
// The composer is compiled with vue/compiler-sfc and mounted in jsdom with the network, Nuxt's
// composables and the presentational children stubbed, as upstream did for React. The port saves the
// AI draft and reads its revision back before asking for a review, so the review's own PATCH is the
// one counted before the review opens; what matters is that nothing PATCHes while it is open, even
// when the form changes behind it.
import assert from "node:assert/strict";
import { afterAll, onTestFinished, test } from "vitest";
import { bundleAppModule, installDom, installVueAutoImports, vuePlugin } from "./helpers/app-module.mjs";

const { dom, cleanup: cleanupDom } = await installDom();
const vue = await import("vue");
const removeAutoImports = installVueAutoImports(vue);
const { createApp, defineComponent, h, nextTick, ref } = vue;

const mocks = new Map([
	["~/utils/compose/compose-utils", `
		export async function fetchDraft() { return globalThis.__reviewTestDraft(); }
		export function formatAttachmentSize(bytes) { return String(bytes); }
		export function buildSendFormData() { throw new Error("No direct send allowed in this test"); }
	`],
	["~/utils/compose/compose-preferences", `
		export function getCachedComposePreferences() { return null; }
		export async function loadComposePreferences() { return { trackOpensDefault: false }; }
	`],
	["~/utils/compose/media", "import { ref } from 'vue'; export function useIsPhone() { return ref(false); }"],
	["~/utils/messages/detail-cache", "export function clearMessageDetailCache() {}"],
]);
const url = await bundleAppModule({
	name: "compose-review",
	contents: `export { default as ComposeForm } from "./app/components/compose/Form.vue";`,
	plugins: [{
		name: "review-network-stubs",
		setup(builder) {
			builder.onResolve({ filter: /^~\/utils\/(compose\/(compose-utils|compose-preferences|media)|messages\/detail-cache)$/ }, args => ({ path: args.path, namespace: "review-test-stub" }));
			builder.onLoad({ filter: /.*/, namespace: "review-test-stub" }, args => ({ contents: mocks.get(args.path), loader: "js", resolveDir: process.cwd() }));
		},
	}, vuePlugin],
});
const { ComposeForm } = await import(url);

const mailbox = { id: "mailbox-1", localPart: "tester", hostname: "example.com", displayName: "Tester", senderAddresses: ["tester@example.com"], signature: "" };
Object.assign(globalThis, {
	useLanguage: () => ({ t: key => key }),
	useToast: () => ({ add() {} }),
	useRouter: () => ({ push() {}, replace() {} }),
	useCompose: () => ({ showNotice() { return 0; }, openDraftComposer() {}, isCurrentNotice() { return false; } }),
	useSelectedMailbox: () => ({ selectedMailbox: ref(mailbox), setSelectedMailbox() {}, mailboxes: ref([mailbox]) }),
	authFetch: (...args) => globalThis.__reviewTestFetch(...args),
});
afterAll(() => {
	removeAutoImports();
	for (const name of ["useLanguage", "useToast", "useRouter", "useCompose", "useSelectedMailbox", "authFetch", "__reviewTestFetch", "__reviewTestDraft"]) delete globalThis[name];
	cleanupDom();
});

const slots = (context, names) => names.flatMap(name => context.slots[name]?.() ?? []);
const stubs = {
	ComposeRichTextEditor: defineComponent({
		props: { modelValue: String, disabled: Boolean },
		emits: ["update:modelValue"],
		setup(props, context) {
			context.expose({ focus() {} });
			return () => h("div", [
				...slots(context, ["toolbar-start"]),
				h("textarea", { "data-body": "yes", value: props.modelValue ?? "", disabled: props.disabled, onInput: event => context.emit("update:modelValue", event.target.value) }),
				...slots(context, ["toolbar-end", "footer", "default"]),
			]);
		},
	}),
	AgentSendReview: defineComponent({
		props: { approvalId: String },
		emits: ["close"],
		setup(props, { emit }) {
			return () => h("div", { "data-review": props.approvalId }, [h("button", { type: "button", "data-cancel-review": true, onClick: () => emit("close") }, "Cancel review")]);
		},
	}),
	UButton: defineComponent({ inheritAttrs: true, props: { label: String }, setup: (props, context) => () => h("button", { type: context.attrs.type ?? "button" }, [props.label, ...slots(context, ["default"])]) }),
	UTooltip: defineComponent({ setup: (_props, context) => () => slots(context, ["default"]) }),
	UIcon: defineComponent({ setup: () => () => h("span") }),
	USelect: defineComponent({ setup: () => () => h("select") }),
	ComposeRecipientInput: defineComponent({ setup: () => () => null }),
	ComposeScheduleSendMenu: defineComponent({ setup: () => () => null }),
	ComposeFollowUpMenu: defineComponent({ setup: () => () => null }),
};

function response(data, status = 200) {
	return { ok: status >= 200 && status < 300, status, async json() { return data; } };
}
async function delay(milliseconds) {
	await new Promise(resolve => setTimeout(resolve, milliseconds));
	await nextTick();
}

test("agent review does not get invalidated by autosave, and cancellation resumes autosave", async () => {
	const requests = [];
	let revision = 4;
	globalThis.__reviewTestDraft = async () => ({
		id: "draft-1", mailboxId: mailbox.id, fromAddr: '"Tester" <tester@example.com>',
		toAddr: "recipient@example.net", ccAddr: null, bccAddr: null,
		subject: "Initial subject", htmlBody: "<p>Initial body</p>", textBody: "Initial body",
		inReplyTo: null, references: null, threadId: null, attachments: [],
		agent: { revision, origin: "chat", scheduledAt: null },
	});
	globalThis.__reviewTestFetch = async (url, options = {}) => {
		const method = options.method || "GET";
		requests.push({ url, method, payload: typeof options.body === "string" ? JSON.parse(options.body) : null });
		if (url === "/api/attachment-policy") return response({ maxMb: 25, cloudThresholdBytes: 3000000 });
		if (url === "/api/drafts/draft-1" && method === "PATCH") {
			revision++;
			return response({ draft: { id: "draft-1" } });
		}
		if (url === "/api/agent/approvals" && method === "POST") {
			return response({ approvalId: "approval-1", snapshot: {
				from: "tester@example.com", to: "recipient@example.net", cc: null, bcc: null,
				subject: "Initial subject", text: "Initial body", html: null, attachments: [], scheduledAt: null,
			} });
		}
		throw new Error("Unexpected route: " + method + " " + url);
	};
	const container = document.createElement("div");
	document.body.appendChild(container);
	const app = createApp({ render: () => h(ComposeForm, { draftIdToLoad: "draft-1" }) });
	for (const [name, stub] of Object.entries(stubs)) app.component(name, stub);
	app.mount(container);
	onTestFinished(() => {
		app.unmount();
		container.remove();
	});

	await delay(0);
	assert.ok(container.querySelector('input[id="page-subject"]'), "loaded draft has a subject");
	assert.equal(container.querySelector('input[id="page-subject"]').value, "Initial subject");
	assert.ok(container.querySelector("form"), "composer form renders");
	await delay(1100);
	requests.length = 0;

	container.querySelector("form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
	await delay(50);
	assert.ok(container.querySelector('[data-review="approval-1"]'), "send review opens");
	const reviewed = requests.find(x => x.url === "/api/agent/approvals");
	assert.ok(reviewed, "review should request a snapshot");
	assert.equal(reviewed.payload.expectedRevision, revision, "review owns current revision");

	// Upstream only waited here. A change that reaches the form while the review is open (a late
	// signature or preferences load, a keystroke behind the dialog) must not autosave either.
	const subjectInput = container.querySelector('input[id="page-subject"]');
	subjectInput.value = "Edited during review";
	subjectInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
	await delay(1200);
	const patchCount = requests.filter(x => x.url === "/api/drafts/draft-1" && x.method === "PATCH").length;
	assert.equal(patchCount, 1, "no extra PATCH may invalidate an issued review snapshot");
	assert.equal(revision, reviewed.payload.expectedRevision, "reviewed revision remains stable");

	container.querySelector("[data-cancel-review]").click();
	await nextTick();
	assert.equal(container.querySelector("[data-review]"), null, "cancel closes review");
	const input = container.querySelector('input[id="page-subject"]');
	input.value = "Edited after cancel";
	input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
	await delay(1200);
	assert.equal(requests.filter(x => x.url === "/api/drafts/draft-1" && x.method === "PATCH").length, 2,
		"a subsequent user edit saves normally after cancelling review");
});
