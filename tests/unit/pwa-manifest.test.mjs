import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "vitest";
import { fileURLToPath } from "node:url";

// (fork) The manifest is the static public/manifest.webmanifest with the Flytower mark, not upstream's
// src/app/manifest.ts, so upstream's theme-colour check against its Next layout does not apply.
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const loadManifest = () => JSON.parse(readFileSync(join(root, "public/manifest.webmanifest"), "utf8"));

test("manifest has a maskable icon entry that exists in public/", () => {
	const manifest = loadManifest();
	const maskable = manifest.icons.filter((icon) => icon.purpose === "maskable");
	assert.equal(maskable.length, 1);
	assert.equal(maskable[0].sizes, "512x512");
	assert.equal(maskable[0].type, "image/png");
	const bytes = readFileSync(join(root, "public", maskable[0].src));
	assert.equal(bytes.readUInt32BE(16), 512, "PNG width");
	assert.equal(bytes.readUInt32BE(20), 512, "PNG height");
});

test("manifest keeps the existing any-purpose icons", () => {
	const manifest = loadManifest();
	const anyIcons = manifest.icons.filter((icon) => !icon.purpose || icon.purpose === "any");
	assert.deepEqual(anyIcons.map((icon) => icon.src), ["/icon-192.png", "/icon-512.png", "/favicon.svg"]);
});

test("the app links the apple-touch icon, which exists in public/", () => {
	const app = readFileSync(join(root, "app/app.vue"), "utf8");
	assert.match(app, /rel: 'apple-touch-icon', href: '\/apple-touch-icon\.png'/);
	assert.equal(readFileSync(join(root, "public/apple-touch-icon.png")).readUInt32BE(16), 180);
});

// Android masks the icon to a circle of 40% of the width; the artwork must sit inside the 80% safe zone (radius 205 of 512).
// (fork) The icon is full-bleed on the brand background, so artwork is anything not that colour.
test("maskable icon artwork fits inside the safe-zone circle", async () => {
	const { default: sharp } = await import("sharp");
	const { data, info } = await sharp(join(root, "public/icon-maskable-512.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
	const background = [data[0], data[1], data[2]];
	let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
	for (let y = 0; y < info.height; y++) {
		for (let x = 0; x < info.width; x++) {
			const i = (y * info.width + x) * 4;
			if (Math.abs(data[i] - background[0]) + Math.abs(data[i + 1] - background[1]) + Math.abs(data[i + 2] - background[2]) > 24) {
				x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
			}
		}
	}
	const centre = info.width / 2;
	for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
		assert.ok(Math.hypot(x - centre, y - centre) <= 205, `corner ${x},${y} outside the safe zone`);
	}
	assert.ok(x1 - x0 > 250, "logo should still fill about 60% of the width");
});
