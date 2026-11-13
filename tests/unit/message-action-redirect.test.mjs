// Ported from legacy/tests/message-action-redirect.test.mjs against app/utils/messages/message-actions-utils.ts
// and detail-navigation-utils.ts.
import assert from "node:assert/strict";
import { test } from "vitest";
import { getMessageActionRedirect } from "../../app/utils/messages/message-actions-utils.ts";
import { getAutoAdvanceId } from "../../app/utils/messages/detail-navigation-utils.ts";

test("moving a message sends the reader back to the list they opened it from", () => {
	for (const action of ["trash", "spam", "archive", "inbox"]) {
		assert.equal(getMessageActionRedirect(action, "/inbox"), "/inbox");
		assert.equal(getMessageActionRedirect(action, "/spam"), "/spam");
	}
});

test("actions that leave the message in place do not navigate", () => {
	for (const action of ["read", "unread", "delete"]) assert.equal(getMessageActionRedirect(action, "/inbox"), null);
});

test("auto-advance opens the email below in the list, else the one above", () => {
	// Newest first, as the list shows them. Unread state must not reorder them.
	const entries = [
		{ id: "a", unread: false },
		{ id: "b", unread: true },
		{ id: "c", unread: true },
		{ id: "d", unread: false },
	];
	assert.equal(getAutoAdvanceId(entries, "a"), "b");
	assert.equal(getAutoAdvanceId(entries, "b"), "c");
	assert.equal(getAutoAdvanceId(entries, "d"), "c");
	assert.equal(getAutoAdvanceId([{ id: "a", unread: false }], "a"), null);
	assert.equal(getAutoAdvanceId(entries, "missing"), null);
});
