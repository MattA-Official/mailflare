// Fork addition: the Anthropic (Claude) agent provider. Requests go to the native Messages API with the key in
// x-api-key, low effort, and thinking room added above the caller's visible output limit; tool calls round-trip.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll as after, test, onTestFinished, vi } from "vitest";
import { build } from "./helpers/esbuild.mjs";
import { generateText, stepCountIs, streamText } from "ai";
import { z } from "zod";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const directory = mkdtempSync(join(root, "node_modules", "mailflare-anthropic-provider-"));
after(() => rmSync(directory, { recursive: true, force: true }));
const stubConfig = {
	name: "provider-config",
	setup(builder) {
		builder.onLoad({ filter: /[\\/]agent[\\/]provider\.ts$/ }, () => ({
			contents: "export async function getAgentProviderConfig() { return globalThis.testAgentProvider; }\nexport function resolveAgentBaseUrl(preset, url) { return preset === 'anthropic' ? 'https://api.anthropic.com/v1' : url; }",
			loader: "ts",
		}));
	},
};
for (const [entry, out] of [["server/lib/agent/model.ts", "model.mjs"], ["server/lib/agent/provider-models.ts", "models.mjs"]]) {
	await build({ entryPoints: [join(root, entry)], outfile: join(directory, out), bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent", plugins: [stubConfig] });
}
const { getAgentModel } = await import(pathToFileURL(join(directory, "model.mjs")).href);
const { listCompatibleAgentModels } = await import(pathToFileURL(join(directory, "models.mjs")).href);

const MODEL = "claude-opus-5-5";

function message(content, stopReason) {
	return { id: "msg_1", type: "message", role: "assistant", model: MODEL, content, stop_reason: stopReason, stop_sequence: null, usage: { input_tokens: 3, output_tokens: 2 } };
}

function sse(events) {
	return new Response(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream" } });
}

function fixture() {
	globalThis.testAgentProvider = { provider: "compatible", preset: "anthropic", baseUrl: "https://api.anthropic.com/v1", apiKey: "sk-ant-test", model: MODEL, models: [MODEL], rates: {}, source: "saved" };
	onTestFinished(() => { delete globalThis.testAgentProvider; });
	const requests = [];
	vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
		const headers = new Headers(init.headers);
		if (String(url).includes("/models")) {
			requests.push({ url: String(url), headers });
			return Response.json({ data: [{ id: MODEL, display_name: "Claude Opus 5.5" }, { id: "claude-sonnet-5-5", display_name: "Claude Sonnet 5.5" }] });
		}
		const body = JSON.parse(init.body);
		requests.push({ url: String(url), headers, body });
		const answered = body.messages.some(m => Array.isArray(m.content) && m.content.some(part => part.type === "tool_result"));
		const callTool = body.tools?.length && !answered;
		if (!body.stream) return Response.json(message([{ type: "text", text: "OK" }], "end_turn"));
		const start = { type: "message_start", message: { ...message([], null), usage: { input_tokens: 3, output_tokens: 0 } } };
		const blocks = callTool
			? [
				{ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_1", name: "list_emails", input: {} } },
				{ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"limit":2}' } },
				{ type: "content_block_stop", index: 0 },
			]
			: [
				{ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
				{ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "OK" } },
				{ type: "content_block_stop", index: 0 },
			];
		return sse([start, ...blocks, { type: "message_delta", delta: { stop_reason: callTool ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 2 } }, { type: "message_stop" }]);
	});
	return requests;
}

test("drafts call the Messages API with low effort and thinking room", async () => {
	const requests = fixture();
	const { model, provider } = await getAgentModel({});
	assert.equal(provider, "anthropic");
	assert.equal((await generateText({ model, prompt: "Say OK", maxOutputTokens: 900 })).text, "OK");
	assert.equal(requests[0].url, "https://api.anthropic.com/v1/messages");
	assert.equal(requests[0].headers.get("x-api-key"), "sk-ant-test");
	assert.equal(requests[0].body.model, MODEL);
	assert.equal(requests[0].body.max_tokens, 8_900);
	assert.equal(requests[0].body.output_config?.effort, "low");
	assert.equal(Object.hasOwn(requests[0].body, "temperature"), false);
	assert.equal(requests[0].body.tool_choice?.type ?? "auto", "auto");
});

test("chat streams a tool call and continues after its result", async () => {
	const requests = fixture();
	const { model } = await getAgentModel({});
	const result = streamText({ model, prompt: "Use the tool then say OK", maxOutputTokens: 1200, stopWhen: stepCountIs(2),
		tools: { list_emails: { description: "List emails", inputSchema: z.object({ limit: z.number() }), execute: async () => ({ messages: [] }) } } });
	assert.equal(await result.text, "OK");
	assert.equal(requests.length, 2);
	assert.equal(requests[0].body.tools[0].name, "list_emails");
	assert.equal(requests[0].body.max_tokens, 9_200);
	assert.ok(requests[1].body.messages.some(m => Array.isArray(m.content) && m.content.some(part => part.type === "tool_result" && part.tool_use_id === "toolu_1")));
});

test("the model list uses Anthropic's headers and display names", async () => {
	const requests = fixture();
	const { models } = await listCompatibleAgentModels({}, { preset: "anthropic", baseUrl: "", apiKey: "sk-ant-test" });
	assert.equal(requests[0].headers.get("x-api-key"), "sk-ant-test");
	assert.equal(requests[0].headers.get("anthropic-version"), "2023-06-01");
	assert.equal(requests[0].headers.has("authorization"), false);
	assert.deepEqual(models.map(m => [m.id, m.name]), [[MODEL, "Claude Opus 5.5"], ["claude-sonnet-5-5", "Claude Sonnet 5.5"]]);
});
