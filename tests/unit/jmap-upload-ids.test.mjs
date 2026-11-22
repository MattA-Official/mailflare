import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll as after, test } from "vitest";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "./helpers/esbuild.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outDir = mkdtempSync(join(tmpdir(), "mailflare-upload-ids-"));
after(() => rmSync(outDir, { recursive: true, force: true }));

async function bundle(entry, outfile) {
	await build({ entryPoints: [join(root, entry)], outfile: join(outDir, outfile), bundle: true, platform: "node", format: "esm", target: "node22", logLevel: "silent", alias: { } });
	return import(pathToFileURL(join(outDir, outfile)).href);
}

const { storeUpload, readUpload, readBlob } = await bundle("server/lib/jmap/blobs.ts", "blobs.mjs");
const { decodeBlobId } = await bundle("server/lib/jmap/ids.ts", "ids.mjs");
// (fork) An in-memory stand-in for R2; upstream used its Node FileBucket, which the fork does not have.
function memoryBucket() {
	const objects = new Map();
	const toBuffer = async (value) => typeof value === "string" ? new TextEncoder().encode(value).buffer : value instanceof ArrayBuffer ? value : await new Response(value).arrayBuffer();
	return {
		async put(key, value, options = {}) { objects.set(key, { body: await toBuffer(value), ...options }); },
		async get(key) {
			const entry = objects.get(key);
			if (!entry) return null;
			return { size: entry.body.byteLength, httpMetadata: entry.httpMetadata ?? {}, customMetadata: entry.customMetadata ?? {}, arrayBuffer: async () => entry.body, text: async () => new TextDecoder().decode(entry.body) };
		},
		async head(key) { const entry = objects.get(key); return entry ? { size: entry.body.byteLength, httpMetadata: entry.httpMetadata ?? {}, customMetadata: entry.customMetadata ?? {} } : null; },
		async delete(key) { objects.delete(key); },
	};
}

function context(userId) {
	return { accountId: userId, auth: { userId }, env: { BUCKET: memoryBucket() } };
}

test("an upload is readable by the account that stored it", async () => {
	const ctx = context("u1");
	const stored = await storeUpload(ctx, new TextEncoder().encode("hello").buffer, "text/plain", "a.txt");
	const upload = await readUpload(ctx, decodeBlobId(stored.blobId).id);
	assert.equal(new TextDecoder().decode(upload.content), "hello");
	assert.equal(upload.name, "a.txt");
});

test("an upload id with dot segments cannot reach another key", async () => {
	const ctx = context("u1");
	await ctx.env.BUCKET.put("avatars/u2", "victim avatar");
	assert.equal(await readUpload(ctx, "../../avatars/u2"), null);
	assert.equal(await readBlob({ ...ctx, memo: { mailboxes: Promise.resolve([]) } }, "up~../../avatars/u2"), null);
});
