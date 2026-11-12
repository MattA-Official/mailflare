import { and, eq, ne, or } from "drizzle-orm";
import { getDb } from "#db";
import { domains, mailboxes } from "#db/schema";
import { disableEmailRouting } from "#lib/cloudflare-api";
import { deleteDnsRecord } from "#lib/cloudflare-dns";
import { deleteEmailRoutingRulesForDomain } from "#lib/domains/cloudflare-cleanup";
import { removeMxRecords } from "#lib/domains/mx-records";
import { setupDomainDnsRecord } from "#lib/domains/dns-setup";
import { adoptCloudflareZone } from "#lib/domains/adopt-zone";
import { isManualZone } from "#lib/domains/provision";
import { listDomainMx, MxConflictError } from "#lib/domains/receiving-dns";
import { ensureMailboxDomainRouting } from "#lib/mailboxes/domain-addresses";
import type { DomainRow } from "#lib/domains/types";

/** Upstream also offered Resend and Amazon SES; this fork receives through Cloudflare Email Routing only. */
export type ReceivingProviderId = "none" | "cloudflare";

const isCloudflareMx = (content: string) => content.toLowerCase().replace(/\.$/, "").endsWith(".mx.cloudflare.net");

/** Email Routing on the zone, the MX and the Worker routes for this domain's mailboxes. */
export async function setupCloudflareReceiving(env: CloudflareEnv, skippedDomain: DomainRow, options: { replaceMx: boolean }): Promise<void> {
	const domain = await adoptCloudflareZone(env, skippedDomain);
	if (isManualZone(domain.zoneId)) throw new Error("Cloudflare Email Routing needs a domain on a Cloudflare zone");
	const foreign = (await listDomainMx(env, domain)).filter((record) => !isCloudflareMx(record.content ?? ""));
	if (foreign.length > 0 && !options.replaceMx) {
		throw new MxConflictError(foreign.map((record) => ({ content: record.content ?? "", priority: record.priority ?? 0 })));
	}
	if (foreign.length > 0) await removeMxRecords(env, domain.zoneId, domain.hostname, []);
	await setupDomainDnsRecord(env, domain, "mx");

	// Cleaning up Cloudflare receiving deletes the per-address Worker routes; put them back.
	const db = getDb(env);
	const mailboxRows = await db
		.select({ id: mailboxes.id, domainId: mailboxes.domainId, localPart: mailboxes.localPart, useAllDomains: mailboxes.useAllDomains })
		.from(mailboxes)
		.innerJoin(domains, eq(mailboxes.domainId, domains.id))
		.where(and(eq(domains.userId, domain.userId), or(eq(mailboxes.domainId, domain.id), eq(mailboxes.useAllDomains, true))));
	await Promise.allSettled(mailboxRows.map((mailbox) => ensureMailboxDomainRouting(env, db, { ...mailbox, useAllDomains: true })));
}

export async function removeCloudflareReceiving(env: CloudflareEnv, domain: DomainRow): Promise<void> {
	if (isManualZone(domain.zoneId)) return;
	await deleteEmailRoutingRulesForDomain(env, domain.zoneId, domain.hostname);
	await removeCloudflareMx(env, domain);
	const db = getDb(env);
	const [otherDomainOnZone] = await db.select({ id: domains.id }).from(domains).where(and(eq(domains.zoneId, domain.zoneId), ne(domains.id, domain.id))).limit(1);
	if (domain.routingEnabled && !otherDomainOnZone) await disableEmailRouting(env, domain.zoneId);
	await db.update(domains).set({ routingEnabled: false }).where(eq(domains.id, domain.id));
}

async function removeCloudflareMx(env: CloudflareEnv, domain: DomainRow): Promise<void> {
	for (const record of await listDomainMx(env, domain)) {
		if (record.id && isCloudflareMx(record.content ?? "")) await deleteDnsRecord(env, domain.zoneId, record.id);
	}
}

export async function setupReceiving(env: CloudflareEnv, domain: DomainRow, options: { replaceMx: boolean }): Promise<void> {
	return setupCloudflareReceiving(env, domain, options);
}

/** Whether Cloudflare receiving is configured for this domain. */
export async function receivingPresence(_env: CloudflareEnv, domain: DomainRow): Promise<{ cloudflare: boolean }> {
	return { cloudflare: domain.routingEnabled };
}
