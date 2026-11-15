// Ported from legacy/tests/contacts.test.mjs; the recipient helpers live in app/utils/compose.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterAll as after, test, onTestFinished } from "vitest";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "./helpers/esbuild.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const directory = mkdtempSync(join(root, "node_modules", "mailflare-contacts-"));
after(() => rmSync(directory, { recursive: true, force: true }));
await build({
	stdin: {
		contents: `
			export { SqliteDatabase } from "./tests/unit/helpers/sqlite-database.mjs";
			export { applyMigrations } from "./tests/unit/helpers/migrate.mjs";
			export { getDb } from "./server/db/index.ts";
			export {
				parseContactsLimit,
				CONTACTS_LIST_DEFAULT_LIMIT,
				CONTACTS_LIST_MAX_LIMIT,
				listContacts,
				saveManualContact,
				encodeContactsCursor,
				decodeContactsCursor,
			} from "./server/handlers/api/contacts/utils.ts";
			export { filterContactSuggestions, formatContactSuggestion } from "./app/utils/compose/recipient-suggestions-utils.ts";
			export { mergeRecipients } from "./app/utils/compose/recipient-utils.ts";
		`,
		resolveDir: root,
		sourcefile: "contacts-entry.ts",
	},
	outfile: join(directory, "entry.mjs"),
	bundle: true,
	platform: "node",
	format: "esm",
	target: "node24",
	packages: "external",
	logLevel: "silent",
});
const {
	SqliteDatabase,
	applyMigrations,
	getDb,
	parseContactsLimit,
	CONTACTS_LIST_DEFAULT_LIMIT,
	CONTACTS_LIST_MAX_LIMIT,
	listContacts,
	saveManualContact,
	encodeContactsCursor,
	decodeContactsCursor,
	filterContactSuggestions,
	formatContactSuggestion,
	mergeRecipients,
} = await import(pathToFileURL(join(directory, "entry.mjs")).href);

test("the contacts list defaults to a bounded page of results", () => {
	assert.equal(parseContactsLimit(null), CONTACTS_LIST_DEFAULT_LIMIT);
	assert.equal(parseContactsLimit(""), CONTACTS_LIST_DEFAULT_LIMIT);
});

test("the contacts list limit is an explicit positive number, clamped to the max", () => {
	assert.equal(parseContactsLimit("8"), 8);
	assert.equal(parseContactsLimit("25"), 25);
	assert.equal(parseContactsLimit("99999"), CONTACTS_LIST_MAX_LIMIT);
});

test("junk limit values fall back to the default instead of erroring", () => {
	for (const value of ["abc", "0", "-3", "1.5x", " "]) {
		assert.equal(parseContactsLimit(value), CONTACTS_LIST_DEFAULT_LIMIT, value);
	}
});

const contact = (email, fields = {}) => ({
	email,
	displayName: null,
	hasAvatar: false,
	blocked: false,
	...fields,
});

test("suggestions drop blocked contacts and addresses already in the chips", () => {
	const suggestions = [
		contact("kept@example.com"),
		contact("blocked@example.com", { blocked: true }),
		contact("picked@example.com"),
		contact("also-kept@example.com"),
	];
	const filtered = filterContactSuggestions(suggestions, ['"Person" <PICKED@example.com>']);
	assert.deepEqual(
		filtered.map((entry) => entry.email),
		["kept@example.com", "also-kept@example.com"],
	);
});

test("suggestions never repeat the same address twice", () => {
	const suggestions = [contact("a@example.com"), contact("A@example.com", { displayName: "A" })];
	assert.equal(filterContactSuggestions(suggestions, []).length, 1);
});

test("a picked suggestion becomes a header-formatted address", () => {
	assert.equal(formatContactSuggestion(contact("plain@example.com")), "plain@example.com");
	assert.equal(
		formatContactSuggestion(contact("named@example.com", { displayName: "Named User" })),
		'"Named User" <named@example.com>',
	);
});

test("mergeRecipients appends contacts without duplicating addresses", () => {
	assert.deepEqual(
		mergeRecipients(["existing@example.com"], ["new@example.com", "EXISTING@example.com"]),
		["existing@example.com", "new@example.com"],
	);
	assert.deepEqual(
		mergeRecipients([], ['"Ada" <ada@example.com>']),
		['"Ada" <ada@example.com>'],
	);
});

async function contactsFixture(t, rows = []) {
	const database = new SqliteDatabase(":memory:");
	onTestFinished(() => database.db.close());
	await applyMigrations(database, join(root, "server/db/migrations/sqlite"));
	database.db.exec(`
		INSERT INTO users (id, email, password_hash, name, role, created_at) VALUES
			('owner', 'owner@one.test', 'hash', 'Owner', 'admin', 1),
			('other', 'other@two.test', 'hash', 'Other', 'user', 1);
	`);
	const insert = database.db.prepare(`
		INSERT INTO contacts (id, user_id, email, display_name, source, blocked, last_seen_at, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`);
	for (const row of rows) insert.run(...row);
	return getDb({ DB: database });
}

const CONTACT_ROWS = [
	["c1", "owner", "zoe@example.com", "Zoe", "manual", 0, null, 1],
	["c2", "owner", "ada@example.com", "Ada", "inbound", 0, null, 1],
	["c3", "owner", "noname@example.com", null, "outbound", 0, null, 1],
	["c4", "owner", "ben@example.com", "Ben", "inbound", 1, null, 1],
	["c5", "other", "ada@example.com", "Stranger Ada", "manual", 0, null, 1],
];

test("listContacts returns the owner's contacts alphabetically by name, address breaks ties", async (t) => {
	const db = await contactsFixture(t, CONTACT_ROWS);
	const rows = await listContacts(db, { userId: "owner", query: "", limit: 100 });
	assert.deepEqual(
		rows.map((row) => row.email),
		["ada@example.com", "ben@example.com", "noname@example.com", "zoe@example.com"],
	);
});

test("listContacts searches name and address case-insensitively and never leaves the owner", async (t) => {
	const db = await contactsFixture(t, CONTACT_ROWS);
	const byName = await listContacts(db, { userId: "owner", query: "ADA" });
	assert.deepEqual(byName.map((row) => row.email), ["ada@example.com"]);
	const byAddress = await listContacts(db, { userId: "owner", query: "noname@example" });
	assert.deepEqual(byAddress.map((row) => row.email), ["noname@example.com"]);
});

test("listContacts treats LIKE wildcards in the query as literal characters", async (t) => {
	const db = await contactsFixture(t, CONTACT_ROWS);
	const escaped = await listContacts(db, { userId: "owner", query: "%@example.com" });
	assert.equal(escaped.length, 0);
});

test("saveManualContact creates then renames without duplicating the address", async (t) => {
	const db = await contactsFixture(t);
	const created = await saveManualContact(db, { userId: "owner", email: "new@example.com", displayName: "New" });
	assert.equal(created.email, "new@example.com");
	assert.equal(created.displayName, "New");
	assert.equal(created.source, "manual");

	const renamed = await saveManualContact(db, { userId: "owner", email: "new@example.com", displayName: "Renamed" });
	assert.equal(renamed.id, created.id);
	assert.equal(renamed.displayName, "Renamed");

	const kept = await saveManualContact(db, { userId: "owner", email: "new@example.com" });
	assert.equal(kept.displayName, "Renamed", "omitting the name keeps the existing one");

	const rows = await listContacts(db, { userId: "owner", query: "", limit: 100 });
	assert.equal(rows.length, 1);
});

// Fork-only: Saved and Other tabs, paging and compose ranking.
test("listContacts splits saved contacts from automatically collected ones", async (t) => {
	const db = await contactsFixture(t, CONTACT_ROWS);
	const saved = await listContacts(db, { userId: "owner", query: "", limit: 100, filter: "saved" });
	assert.deepEqual(saved.map((row) => row.email), ["zoe@example.com"]);
	const other = await listContacts(db, { userId: "owner", query: "", limit: 100, filter: "other" });
	assert.deepEqual(other.map((row) => row.email), ["ada@example.com", "ben@example.com", "noname@example.com"]);
});

test("listContacts pages with a cursor without skipping or repeating anyone", async (t) => {
	const db = await contactsFixture(t, CONTACT_ROWS);
	const seen = [];
	let cursor = null;
	do {
		const page = await listContacts(db, { userId: "owner", query: "", limit: 2, cursor });
		seen.push(...page.map((row) => row.email));
		cursor = page.length === 2 ? decodeContactsCursor(encodeContactsCursor(page.at(-1))) : null;
	} while (cursor);
	assert.deepEqual(seen, ["ada@example.com", "ben@example.com", "noname@example.com", "zoe@example.com"]);
});

test("a malformed cursor is ignored rather than failing the request", () => {
	assert.equal(decodeContactsCursor("not json"), null);
	assert.equal(decodeContactsCursor('{"key":1}'), null);
	assert.equal(decodeContactsCursor(null), null);
});

test("suggestions rank saved people, then people written to, then recent senders, and skip blocked ones", async (t) => {
	const db = await contactsFixture(t, [
		["s1", "owner", "joanna.old@example.com", "Joanna Old", "inbound", 0, 1000, 1],
		["s2", "owner", "jo.recent@example.com", "Jo Recent", "inbound", 0, 5000, 1],
		["s3", "owner", "jo.sent@example.com", "Jo Sent", "outbound", 0, 10, 1],
		["s4", "owner", "mary.jones@example.com", "Mary Jones", "manual", 0, 10, 1],
		["s5", "owner", "jo.blocked@example.com", "Jo Blocked", "manual", 1, 9000, 1],
		["s6", "owner", "banjo@example.com", "Banjo", "manual", 0, 9000, 1],
	]);
	const rows = await listContacts(db, { userId: "owner", query: "jo", limit: 8, sort: "suggest" });
	assert.deepEqual(rows.map((row) => row.email), [
		// Saved: a word in the name starting with "jo" beats "jo" in the middle of a word.
		"mary.jones@example.com",
		"banjo@example.com",
		// Written to.
		"jo.sent@example.com",
		// Heard from, most recent first.
		"jo.recent@example.com",
		"joanna.old@example.com",
	]);
});
