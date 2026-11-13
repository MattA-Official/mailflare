// Fork: Anthropic's model list takes the key as x-api-key, not a bearer token. Upstream's
// agent-anthropic.test.mjs covers the Messages API itself.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll as after, test, vi } from "vitest";
import { build } from "./helpers/esbuild.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const directory = mkdtempSync(join(root, "node_modules", "mailflare-anthropic-provider-"));
after(() => rmSync(directory, { recursive: true, force: true }));
await build({
	entryPoints: [join(root, "server/lib/agent/provider-models.ts")],
	outfile: join(directory, "models.mjs"),
	bundle: true,
	platform: "node",
	format: "esm",
	packages: "external",
	logLevel: "silent",
	plugins: [{
		name: "provider-config",
		setup(builder) {
			builder.onLoad({ filter: /[\\/]agent[\\/]provider\.ts$/ }, () => ({
				contents: "export async function getAgentProviderConfig() { return { provider: 'cloudflare' }; }\nexport function resolveAgentBaseUrl(preset, url) { return preset === 'anthropic' ? 'https://api.anthropic.com/v1' : url; }",
				loader: "ts",
			}));
		},
	}],
});
const { listCompatibleAgentModels } = await import(pathToFileURL(join(directory, "models.mjs")).href);

test("the model list uses Anthropic's headers and display names", async () => {
	const requests = [];
	vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
		requests.push({ url: String(url), headers: new Headers(init.headers) });
		return Response.json({ data: [{ id: "claude-opus-5-5", display_name: "Claude Opus 5.5" }, { id: "claude-sonnet-5-5", display_name: "Claude Sonnet 5.5" }] });
	});
	const { models } = await listCompatibleAgentModels({}, { preset: "anthropic", baseUrl: "", apiKey: "sk-ant-test" });
	assert.equal(requests[0].url, "https://api.anthropic.com/v1/models?limit=1000");
	assert.equal(requests[0].headers.get("x-api-key"), "sk-ant-test");
	assert.equal(requests[0].headers.get("anthropic-version"), "2023-06-01");
	assert.equal(requests[0].headers.has("authorization"), false);
	assert.deepEqual(models.map(m => [m.id, m.name]), [["claude-opus-5-5", "Claude Opus 5.5"], ["claude-sonnet-5-5", "Claude Sonnet 5.5"]]);
});
