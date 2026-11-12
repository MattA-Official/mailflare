// Ported from legacy/tests/layout-mail-search-provider.test.mjs against app/composables/useMailSearch.ts.
// Upstream kept the search box in a React context, so it checked that every layout mounting a NavItem
// sidebar wrapped it in MailSearchProvider and that useMailSearch had a fallback outside one. The port
// keeps the state at module level with no provider, so only the "works anywhere" cases still apply.
import assert from "node:assert/strict";
import { afterAll, test } from "vitest";
import { computed, nextTick, ref, watch } from "vue";
import { importAppModule } from "./helpers/app-module.mjs";

Object.assign(globalThis, { ref, computed, watch, AUTH_SESSION_CHANGED_EVENT: "test-auth-changed" });
afterAll(() => { for (const name of ["ref", "computed", "watch", "AUTH_SESSION_CHANGED_EVENT"]) delete globalThis[name]; });
const { useMailSearch } = await importAppModule({ entry: "app/composables/useMailSearch.ts", name: "mail-search", define: { "import.meta.client": "false" } });

test("useMailSearch starts empty and works outside any component", () => {
	const search = useMailSearch();
	assert.equal(search.query.value, "");
	assert.equal(search.input.value, "");
	assert.doesNotThrow(() => search.setQuery("test"));
	assert.equal(search.input.value, "test");
	search.setQuery("");
});

test("every caller shares one search box; typing settles after a pause and clearing is immediate", async () => {
	const first = useMailSearch();
	const second = useMailSearch();
	first.setQuery("invoice");
	assert.equal(second.input.value, "invoice");
	await nextTick();
	assert.equal(second.query.value, "");
	await new Promise(resolve => setTimeout(resolve, 300));
	assert.equal(second.query.value, "invoice");
	first.setQuery("");
	await nextTick();
	await new Promise(resolve => setTimeout(resolve, 0));
	assert.equal(second.query.value, "");
});
