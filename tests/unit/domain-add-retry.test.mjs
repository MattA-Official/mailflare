// Ported from legacy/tests/domain-add-retry.test.mjs against app/utils/admin/email/domains.ts.
// Upstream asked with window.confirm and built the prompt text itself (confirmMxReplacement), and a
// declined replacement threw. The port asks through a confirm callback that the page renders as a
// dialog (given the server's message and the conflicting records), and a declined replacement
// resolves null, so those cases now check the callback's arguments and the null result instead.
import assert from "node:assert/strict";
import { onTestFinished, test, vi } from "vitest";
import { ApiError } from "../../app/utils/auth-client.ts";
import { createDomain, isMxConflictError, runReceivingSetup } from "../../app/utils/admin/email/domains.ts";

function mockFetch(responses) {
	const calls = [];
	vi.stubGlobal("localStorage", { getItem: () => null, setItem() {}, removeItem() {} });
	onTestFinished(() => vi.unstubAllGlobals());
	vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options = {}) => {
		const spec = responses[calls.length] ?? responses.at(-1);
		calls.push({ url: String(url), body: options.body ? JSON.parse(options.body) : undefined });
		return Response.json(spec.data ?? {}, { status: spec.status ?? 200 });
	});
	return calls;
}

function recordingConfirm(answer) {
	const prompts = [];
	const confirm = async (message, records) => {
		prompts.push({ message, records });
		return answer;
	};
	return { prompts, confirm };
}

const input = {
	hostname: "example.com",
	enableRouting: true,
	skipDns: false,
	sendingProvider: "cloudflare",
	receivingProvider: "cloudflare",
};
const recordsConflict = { status: 409, data: { error: "Existing MX records currently deliver mail to another provider.", code: "MX_RECORDS_CONFLICT" } };

test("on 409 MX_RECORDS_CONFLICT, when the user confirms, retries with replaceMxRecords: true and succeeds", async () => {
	const calls = mockFetch([recordsConflict, { data: { domain: { id: "dom_123", hostname: "example.com" } } }]);
	const { prompts, confirm } = recordingConfirm(true);

	const result = await createDomain(input, confirm);
	assert.deepEqual(result, { domain: { id: "dom_123", hostname: "example.com" } });
	assert.equal(calls.length, 2, "must make initial request and one retry request");
	assert.equal(calls[0].url, "/api/domains");
	assert.deepEqual(calls[0].body, input);
	assert.equal(calls[1].url, "/api/domains");
	assert.deepEqual(calls[1].body, { ...input, replaceMxRecords: true });
	assert.deepEqual(prompts, [{ message: "Existing MX records currently deliver mail to another provider.", records: [] }]);
});

test("on 409 MX_RECORDS_CONFLICT, when the user declines, does not retry and resolves null", async () => {
	const calls = mockFetch([recordsConflict]);
	const { prompts, confirm } = recordingConfirm(false);

	assert.equal(await createDomain(input, confirm), null);
	assert.equal(prompts.length, 1, "user must be prompted to confirm");
	assert.equal(calls.length, 1, "must not retry when user declines replacement");
});

test("supports 409 MX_CONFLICT with records list for per-domain flows", async () => {
	const records = [
		{ priority: 10, content: "mail.legacy.test" },
		{ priority: 20, content: "mail2.legacy.test" },
	];
	const calls = mockFetch([
		{ status: 409, data: { error: "This domain has MX records for another mail service.", code: "MX_CONFLICT", records } },
		{ data: { domain: { id: "dom_456", hostname: "custom.test" } } },
	]);
	const { prompts, confirm } = recordingConfirm(true);

	const result = await createDomain({ hostname: "custom.test" }, confirm);
	assert.deepEqual(result, { domain: { id: "dom_456", hostname: "custom.test" } });
	assert.equal(calls.length, 2, "must retry with replace flag");
	assert.equal(calls[1].body.replaceMxRecords, true);
	assert.deepEqual(prompts[0].records, records);
});

test("receiving setup retries with replaceMx and reports a declined replacement", async () => {
	const conflict = { status: 409, data: { error: "This domain has MX records for another mail service.", code: "MX_CONFLICT", records: [] } };
	let calls = mockFetch([conflict, { data: { ok: true } }]);
	assert.equal(await runReceivingSetup("dom_1", recordingConfirm(true).confirm), true);
	assert.deepEqual(calls.map(call => [call.url, call.body]), [
		["/api/domains/dom_1/receiving/cloudflare", { replaceMx: false }],
		["/api/domains/dom_1/receiving/cloudflare", { replaceMx: true }],
	]);

	calls = mockFetch([conflict]);
	assert.equal(await runReceivingSetup("dom_1", recordingConfirm(false).confirm), false);
	assert.equal(calls.length, 1);
});

test("on non-MX 409 or other errors, does not prompt and throws without retry", async () => {
	const confirm = async () => {
		throw new Error("confirm must not be called for non-MX conflicts");
	};
	for (const response of [{ status: 409, data: { error: "Domain is already registered", code: "DOMAIN_EXISTS" } }, { status: 500, data: { error: "Internal Server Error" } }]) {
		const calls = mockFetch([response]);
		await assert.rejects(
			async () => createDomain({ hostname: "example.com" }, confirm),
			(err) => {
				assert.ok(err instanceof ApiError);
				assert.equal(isMxConflictError(err), false);
				return true;
			},
		);
		assert.equal(calls.length, 1, `must not retry on ${response.status}`);
	}
});

test("isMxConflictError helper correctly detects MX conflict errors for UI checklist suppression", () => {
	assert.equal(isMxConflictError(new ApiError("conflict", 409, { code: "MX_CONFLICT" })), true);
	assert.equal(isMxConflictError(new ApiError("conflict", 409, { code: "MX_RECORDS_CONFLICT" })), true);
	assert.equal(isMxConflictError(new ApiError("conflict", 500, { code: "MX_CONFLICT" })), false);
	assert.equal(isMxConflictError(new ApiError("forbidden", 409, { code: "FORBIDDEN" })), false);
	assert.equal(isMxConflictError(new ApiError("other", 409, {})), false);
	assert.equal(isMxConflictError(new Error("standard error")), false);
	assert.equal(isMxConflictError(null), false);
	assert.equal(isMxConflictError(undefined), false);
});
