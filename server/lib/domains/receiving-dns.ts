import { listMxRecords } from "#lib/cloudflare-dns";
import { isManualZone } from "#lib/domains/provision";
import type { CfDnsRecord } from "#lib/cloudflare-api.types";
import type { DomainRow } from "#lib/domains/types";

/** Thrown when other mail servers' MX records would shadow the one being added. */
export class MxConflictError extends Error {
	readonly code = "MX_CONFLICT";
	constructor(
		readonly records: { content: string; priority: number }[],
		message = "This domain has MX records for another mail service. Replace them to receive mail here.",
	) {
		super(message);
	}
}

export async function listDomainMx(env: CloudflareEnv, domain: DomainRow): Promise<CfDnsRecord[]> {
	if (isManualZone(domain.zoneId)) return [];
	return listMxRecords(env, domain.zoneId, domain.hostname);
}
