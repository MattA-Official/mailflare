// Ported from legacy/tests/message-actions-overflow.test.mjs against app/utils/messages/action-overflow-utils.ts.
import assert from "node:assert/strict";
import { test } from "vitest";
import { getVisibleActionCount } from "../../app/utils/messages/action-overflow-utils.ts";

// Archive, delete, read, reply, spam, reply all, forward.
const groups = ["primary", "primary", "primary", "secondary", "secondary", "secondary", "secondary"];
const count = (availableWidth, actionGroups = groups) => getVisibleActionCount({ availableWidth, groups: actionGroups });

test("the overflow trigger is reserved before any action", () => {
	assert.equal(count(31), 0);
	assert.equal(count(32), 0);
	assert.equal(count(71), 0);
	assert.equal(count(72), 1);
});

test("a group divider is counted only with an action after it", () => {
	// Three actions use 32 + 3 * 40 = 152px. The divider (1px rule and mx-2) plus
	// the fourth action needs 65px more, so 216px stops at three and 217px shows four.
	assert.equal(count(216), 3);
	assert.equal(count(217), 4);
});

test("typical phone widths fill the row before overflowing", () => {
	assert.equal(count(216), 3); // 320px viewport
	assert.equal(count(286), 5); // 390px viewport, as in the reproduction
	assert.equal(count(362), 7); // 466px viewport, every action fits
});

test("no divider is reserved when every action belongs to one group", () => {
	const oneGroup = groups.map(() => "primary");
	assert.equal(count(112, oneGroup), 2);
	assert.equal(count(200, oneGroup), 4);
});

test("invalid or empty widths keep only the overflow menu", () => {
	assert.equal(count(0), 0);
	assert.equal(count(-10), 0);
	assert.equal(count(Number.NaN), 0);
	assert.equal(count(500, []), 0);
});

test("a wide row shows every action", () => {
	assert.equal(count(1000), 7);
});
