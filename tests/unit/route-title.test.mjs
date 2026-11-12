// Ported from legacy/tests/route-title.test.mjs against app/utils/shell/route-title.ts.
import assert from "node:assert/strict";
import { test } from "vitest";
import { getRouteTitleKey } from "../../app/utils/shell/route-title.ts";

test("pages are titled with the most specific matching route", () => {
	assert.equal(getRouteTitleKey("/settings"), "settings.nav.settings");
	assert.equal(getRouteTitleKey("/settings/security"), "settings.nav.security");
	assert.equal(getRouteTitleKey("/settings/api-keys"), "settings.nav.apiKeys");
	assert.equal(getRouteTitleKey("/accounts/abc/permissions"), "admin.nav.accounts");
	assert.equal(getRouteTitleKey("/domains"), "admin.nav.domains");
});

test("routes that set their own title are left alone", () => {
	for (const path of ["/inbox", "/inbox/msg_1", "/sent", "/folders/f1", "/login", "/domainsx"]) assert.equal(getRouteTitleKey(path), null);
});
