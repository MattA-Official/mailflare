// Ported from legacy/tests/message-detail-cache.test.mjs against app/utils/messages/detail-cache.ts.
// authFetch and AUTH_SESSION_CHANGED_EVENT are Nuxt auto-imports, provided here on globalThis.
import assert from "node:assert/strict";
import { afterAll, test } from "vitest";
import { importAppModule } from "./helpers/app-module.mjs";

globalThis.AUTH_SESSION_CHANGED_EVENT = "session-changed";
globalThis.authFetch = (...args) => globalThis.detailFetch(...args);
const cache = await importAppModule({ entry: "app/utils/messages/detail-cache.ts", name: "detail-cache", define: { "import.meta.client": "false" } });
const data = id => ({ message: { id, read: false }, body: { textBody: id, htmlBody: null } });
const response = (value, ok = true) => ({ ok, json: async () => value });
afterAll(() => { delete globalThis.detailFetch; delete globalThis.authFetch; delete globalThis.AUTH_SESSION_CHANGED_EVENT; });

test("concurrent detail and forced refresh callers share one request; cached reopen needs none", async () => {
	cache.clearMessageDetailCache(); let resolve; let requests = 0;
	globalThis.detailFetch = (url, init) => {
		requests++; assert.equal(init.cache, "no-store");
		return new Promise(done => { resolve = done; });
	};
	const first = cache.fetchCachedMessageDetail("one");
	const second = cache.fetchCachedMessageDetail("one", true);
	assert.equal(requests, 1);
	resolve(response(data("one")));
	assert.deepEqual(await first, await second);
	assert.deepEqual(await cache.fetchCachedMessageDetail("one"), data("one"));
	assert.equal(requests, 1);
});

test("cache invalidation blocks old account data and preserves a newer pending request", async () => {
	cache.clearMessageDetailCache(); let resolveOld, resolveNew; let requests = 0;
	globalThis.detailFetch = () => new Promise(done => { requests++; resolveOld = done; });
	const old = cache.fetchCachedMessageDetail("one");
	const rejected = assert.rejects(old, /invalidated/);
	cache.clearMessageDetailCache();
	globalThis.detailFetch = () => new Promise(done => { requests++; resolveNew = done; });
	const fresh = cache.fetchCachedMessageDetail("one");
	resolveOld(response(data("old"))); await rejected;
	assert.equal(cache.getCachedMessageDetail("one"), undefined);
	const concurrent = cache.fetchCachedMessageDetail("one");
	assert.equal(requests, 2);
	resolveNew(response(data("new")));
	assert.deepEqual(await concurrent, await fresh);
	assert.equal(cache.getCachedMessageDetail("one").message.id, "new");
});

test("failed HTTP responses and network errors are retried rather than cached", async () => {
	cache.clearMessageDetailCache(); let requests = 0;
	globalThis.detailFetch = async () => { requests++; return response({ error: "Forbidden" }, false); };
	await cache.fetchCachedMessageDetail("one"); await cache.fetchCachedMessageDetail("one");
	assert.equal(requests, 2); assert.equal(cache.getCachedMessageDetail("one"), undefined);
	globalThis.detailFetch = async () => { throw new Error("offline"); };
	await assert.rejects(cache.fetchCachedMessageDetail("one"), /offline/);
	globalThis.detailFetch = async () => response(data("one"));
	assert.equal((await cache.fetchCachedMessageDetail("one")).message.id, "one");
});

test("details expire after five minutes; storage is bounded and read-state updates still work", async () => {
	cache.clearMessageDetailCache(); const now = Date.now; let time = 1000;
	Date.now = () => time;
	try {
		globalThis.detailFetch = async () => response(data("one"));
		await cache.fetchCachedMessageDetail("one");
		cache.setCachedMessageRead("one", true);
		assert.equal(cache.getCachedMessageDetail("one").message.read, true);
		time += 300_001;
		assert.equal(cache.getCachedMessageDetail("one"), undefined);
		for (let index = 0; index < 51; index++) cache.primeMessageDetail({ id: String(index), textBody: "body" });
		assert.equal(cache.getCachedMessageDetail("0"), undefined);
		assert.equal(cache.getCachedMessageDetail("50").body.textBody, "body");
	} finally { Date.now = now; }
});
