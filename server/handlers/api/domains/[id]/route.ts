import { NextResponse } from "#lib/http/next-compat";
import { and, eq } from "drizzle-orm";
import { getDb } from "#db";
import { domains, mailboxes } from "#db/schema";
import { getEnv } from "#lib/cloudflare";
import { requireUser } from "#lib/auth/cookies";
import { canManageDomains } from "#lib/auth/admin";
import { getDomainForUser, removeDomainForUser } from "#lib/domains/service";
import { hasValidSessionMutationOrigin } from "#lib/auth/origin";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
	const { id } = await params;
	const env = getEnv();
	const user = await requireUser(env, request);
	const domain = await getDomainForUser(env, user.id, id);
	if (!domain) return NextResponse.json({ error: "Not found" }, { status: 404 });
	return NextResponse.json({ domain });
}

/** Clears the "DNS skipped" warning once the operator has set the records themselves. */
export async function PATCH(request: Request, { params }: Params) {
	const { id } = await params;
	const env = getEnv();
	const user = await requireUser(env, request);
	if (!canManageDomains(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	if (!hasValidSessionMutationOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
	const body = (await request.json().catch(() => null)) as { dnsSkipped?: unknown } | null;
	if (typeof body?.dnsSkipped !== "boolean") {
		return NextResponse.json({ error: "dnsSkipped must be a boolean" }, { status: 400 });
	}
	const domain = await getDomainForUser(env, user.id, id);
	if (!domain) return NextResponse.json({ error: "Not found" }, { status: 404 });
	await getDb(env).update(domains).set({ dnsSkipped: body.dnsSkipped }).where(eq(domains.id, id));
	return NextResponse.json({ domain: { ...domain, dnsSkipped: body.dnsSkipped } });
}

export async function DELETE(request: Request, { params }: Params) {
	const { id } = await params;
	const env = getEnv();
	const user = await requireUser(env, request);
	if (!canManageDomains(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	if (!hasValidSessionMutationOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
	// Fork-only: shared inboxes hold themselves, so removing their domain must not take them silently.
	const sharedInboxes = await getDb(env)
		.select({ localPart: mailboxes.localPart, hostname: domains.hostname })
		.from(mailboxes)
		.innerJoin(domains, eq(mailboxes.domainId, domains.id))
		.where(and(eq(mailboxes.domainId, id), eq(domains.userId, user.id), eq(mailboxes.type, "shared"), eq(mailboxes.disabled, false)));
	if (sharedInboxes.length) {
		const addresses = sharedInboxes.map((inbox) => `${inbox.localPart}@${inbox.hostname}`).sort().join(", ");
		return NextResponse.json({ error: `Delete the shared inboxes on this domain first: ${addresses}` }, { status: 409 });
	}
	try {
		await removeDomainForUser(env, user.id, id);
		return NextResponse.json({ ok: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : "Failed to remove domain";
		return NextResponse.json({ error: message }, { status: 400 });
	}
}
