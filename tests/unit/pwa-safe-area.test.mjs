import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "vitest";
import { fileURLToPath } from "node:url";

// (fork) Upstream pads each Next layout. Here the body takes the padding for every page that scrolls,
// and the fixed dashboard shell and its mobile drawer carry the utility themselves.
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const css = readFileSync(join(root, "app/assets/css/main.css"), "utf8");

test("the safe-area utility pads all four sides from env(safe-area-inset-*)", () => {
	const block = css.match(/@utility safe-area \{([^}]*)\}/)?.[1] ?? "";
	for (const side of ["top", "right", "bottom", "left"]) {
		assert.match(block, new RegExp(`padding-${side}: env\\(safe-area-inset-${side}\\);`));
	}
});

test("viewport-fit=cover is paired with padding on the body, the dashboard shell and its drawer", () => {
	assert.match(readFileSync(join(root, "app/app.vue"), "utf8"), /viewport-fit=cover/);
	assert.match(css, /body \{\s*@apply safe-area;/);
	const layout = readFileSync(join(root, "app/layouts/dashboard.vue"), "utf8");
	assert.match(layout, /<UDashboardGroup [^>]*class="safe-area"/);
	assert.match(layout, /content: 'safe-area'/);
});
