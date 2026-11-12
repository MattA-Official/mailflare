// Ported from legacy/tests/current-user-permission-reset.test.mjs against
// app/composables/useCurrentUser.ts. Upstream's fetchCurrentUser is fetchSessionInfo here (it resolves
// to the whole /api/auth/me answer), and useCurrentUser returns a readonly ref instead of rendering
// through React, so the second case reads the ref where upstream read the rendered text.
import assert from "node:assert/strict";
import { afterAll, test } from "vitest";
import { JSDOM } from "jsdom";
import { readonly, ref } from "vue";
import { importAppModule } from "./helpers/app-module.mjs";

const dom = new JSDOM("<!doctype html>");
Object.assign(globalThis, {
	window: dom.window,
	ref,
	readonly,
	AUTH_SESSION_CHANGED_EVENT: "permission-session-changed",
	authFetch: () => globalThis.fetchUserResponse(),
});
const originalFetch = globalThis.fetch;
globalThis.fetch = () => globalThis.fetchUserResponse();
afterAll(() => {
	dom.window.close();
	globalThis.fetch = originalFetch;
	for (const name of ["window", "ref", "readonly", "AUTH_SESSION_CHANGED_EVENT", "authFetch", "fetchUserResponse"]) delete globalThis[name];
});

const { fetchSessionInfo, clearCurrentUserCache, useCurrentUser } = await importAppModule({ entry: "app/composables/useCurrentUser.ts", name: "current-user" });
const response = role => ({ ok: true, status: 200, json: async () => ({ user: { id: role, role, isPrimaryAdmin: role === "admin", canManageDomains: role === "admin" } }) });

test("an old account response cannot repopulate permissions or clear the new inflight request", async () => {
	clearCurrentUserCache(); let oldResolve, newResolve;
	globalThis.fetchUserResponse = () => new Promise(resolve => { oldResolve = resolve; });
	const oldRequest = fetchSessionInfo();
	clearCurrentUserCache();
	globalThis.fetchUserResponse = () => new Promise(resolve => { newResolve = resolve; });
	const newRequest = fetchSessionInfo();
	oldResolve(response("admin")); assert.equal(await oldRequest, null);
	assert.equal(fetchSessionInfo(), newRequest);
	newResolve(response("user")); assert.equal((await newRequest).user.role, "user");
	assert.equal((await fetchSessionInfo()).user.canManageDomains, false);
});

test("account switch immediately hides old permission UI until the new account resolves", async () => {
	clearCurrentUserCache(); globalThis.fetchUserResponse = async () => response("admin"); await fetchSessionInfo();
	const user = useCurrentUser();
	assert.equal(user.value?.canManageDomains, true);
	let resolve;
	globalThis.fetchUserResponse = () => new Promise(done => { resolve = done; });
	window.dispatchEvent(new dom.window.Event("permission-session-changed"));
	assert.equal(user.value, null);
	const pending = fetchSessionInfo();
	resolve(response("user")); await pending;
	assert.equal(user.value?.canManageDomains, false);
});
