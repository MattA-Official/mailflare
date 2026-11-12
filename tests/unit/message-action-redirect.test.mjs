// Ported from legacy/tests/message-action-redirect.test.mjs against app/utils/messages/message-actions-utils.ts.
import assert from "node:assert/strict";
import { test } from "vitest";
import { getMessageActionRedirect } from "../../app/utils/messages/message-actions-utils.ts";

test("moving a message sends the reader back to the list they opened it from", () => {
	for (const action of ["trash", "spam", "archive", "inbox"]) {
		assert.equal(getMessageActionRedirect(action, "/inbox"), "/inbox");
		assert.equal(getMessageActionRedirect(action, "/spam"), "/spam");
	}
});

test("actions that leave the message in place do not navigate", () => {
	for (const action of ["read", "unread", "delete"]) assert.equal(getMessageActionRedirect(action, "/inbox"), null);
});
