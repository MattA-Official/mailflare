// Ported from legacy/tests/compose-insert-link.test.mjs against app/components/compose/RichTextEditor.vue.
// The editor is compiled with vue/compiler-sfc and mounted in jsdom. Nuxt UI's UInput and UButton and
// the toolbar (ComposeFormatButtons) are stood in for by plain elements, so this covers the editor's
// own link popup: where the link goes, and that it never submits the surrounding composer form.
import assert from "node:assert/strict";
import { afterAll, onTestFinished, test } from "vitest";
import { JSDOM } from "jsdom";
import { bundleAppModule, installVueAutoImports, vuePlugin } from "./helpers/app-module.mjs";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://mail.example/", pretendToBeVisual: true });
const globals = ["window", "document", "HTMLElement", "Element", "Node", "Event", "KeyboardEvent", "MouseEvent", "SVGElement", "DOMParser", "getComputedStyle"];
for (const key of globals) globalThis[key] = key === "window" ? dom.window : dom.window[key];
document.queryCommandState = () => false;
document.queryCommandValue = () => "";

const url = await bundleAppModule({
	name: "rich-text-editor",
	contents: `
		export { default as RichTextEditor } from "./app/components/compose/RichTextEditor.vue";
		export * as vue from "vue";
		export { defaultTranslator } from "#lib/i18n/utils";
	`,
	plugins: [vuePlugin],
});
const { RichTextEditor, vue, defaultTranslator } = await import(url);
const removeAutoImports = installVueAutoImports(vue);
globalThis.useLanguage = () => ({ t: defaultTranslator });
afterAll(() => {
	removeAutoImports();
	delete globalThis.useLanguage;
	dom.window.close();
	for (const key of globals) delete globalThis[key];
});

const { createApp, defineComponent, h, nextTick, ref } = vue;
const stubs = {
	ComposeFormatButtons: defineComponent({
		emits: ["run", "link"],
		setup(_props, { emit }) {
			return () => h("button", { type: "button", "aria-label": defaultTranslator("editor.insertLink"), onMousedown: (event) => event.preventDefault(), onClick: () => emit("link") });
		},
	}),
	UInput: defineComponent({
		props: { modelValue: String },
		emits: ["update:modelValue"],
		setup(props, { emit }) {
			return () => h("input", { value: props.modelValue, onInput: (event) => emit("update:modelValue", event.target.value) });
		},
	}),
	UButton: defineComponent({
		props: { label: String },
		setup(props) {
			return () => h("button", { type: "button" }, props.label);
		},
	}),
};

async function setup(selected = false) {
	const container = document.createElement("div");
	document.body.appendChild(container);
	let submits = 0;
	const commands = [];
	document.execCommand = (command, _showUi, value) => {
		commands.push({ command, value, selection: window.getSelection().toString() });
		return true;
	};
	const app = createApp({
		setup() {
			const body = ref("Read this");
			return () => h("form", { onSubmit(event) { event.preventDefault(); submits++; } }, [
				h(RichTextEditor, { id: "body", modelValue: body.value, "onUpdate:modelValue": (value) => { body.value = value; } }),
			]);
		},
	});
	for (const [name, stub] of Object.entries(stubs)) app.component(name, stub);
	app.mount(container);
	onTestFinished(() => {
		app.unmount();
		container.remove();
	});
	await nextTick();
	const editor = container.querySelector('[role="textbox"]');
	editor.focus();
	const range = document.createRange();
	range.setStart(editor.firstChild, selected ? 0 : 9);
	range.setEnd(editor.firstChild, 9);
	window.getSelection().removeAllRanges();
	window.getSelection().addRange(range);
	container.querySelector('[aria-label="Insert link"]').click();
	await nextTick();
	const input = container.querySelector('input[placeholder="https://example.com"]');
	assert.ok(input);
	assert.equal(container.querySelectorAll("form").length, 1, "the popup must not nest a form inside the composer");
	return {
		commands,
		async fill(value) {
			input.value = value;
			input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
			await nextTick();
		},
		async apply(key) {
			let event;
			if (key) {
				event = new dom.window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
				input.dispatchEvent(event);
			} else {
				Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Apply").click();
			}
			await nextTick();
			assert.equal(submits, 0, "inserting a link must not submit the composer");
			assert.equal(container.querySelector('input[placeholder="https://example.com"]'), null, "the popup closes");
			return event;
		},
	};
}

test("Apply inserts a URL at the caret without submitting the compose form", async () => {
	const popup = await setup();
	await popup.fill(" example.com ");
	await popup.apply();
	assert.deepEqual(popup.commands, [{ command: "insertHTML", value: '<a href="https://example.com">https://example.com</a>', selection: "" }]);
});

test("Enter links the saved text selection and prevents implicit form submission", async () => {
	const popup = await setup(true);
	await popup.fill("https://example.com/read");
	const event = await popup.apply("Enter");
	assert.equal(event.defaultPrevented, true);
	assert.deepEqual(popup.commands, [{ command: "createLink", value: "https://example.com/read", selection: "Read this" }]);
});

test("Apply with a blank URL closes the popup without inserting or submitting", async () => {
	const popup = await setup();
	await popup.fill("   ");
	await popup.apply();
	assert.deepEqual(popup.commands, []);
});

test("Escape cancels link insertion", async () => {
	const popup = await setup();
	await popup.fill("https://example.com");
	await popup.apply("Escape");
	assert.deepEqual(popup.commands, []);
});
