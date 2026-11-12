import { eq } from "drizzle-orm";
import { getDb } from "#db";
import { domains } from "#db/schema";
import { getEmailAddress } from "#lib/email/address";
import type { OutboundProviderConfig, OutboundProviderMessage } from "#lib/email/outbound-provider-types";

/**
 * Each domain either sends through Cloudflare Email Sending or is receive-only
 * (`none`). Upstream also offered Resend and Amazon SES; this fork does not.
 */

/** The provider for the domain a message is sent from. */
export async function getOutboundProviderConfig(env: CloudflareEnv, fromAddress: string): Promise<OutboundProviderConfig> {
	const hostname = getEmailAddress(fromAddress).split("@")[1]?.toLowerCase();
	const [domain] = hostname
		? await getDb(env).select({ provider: domains.sendingProvider }).from(domains).where(eq(domains.hostname, hostname)).limit(1)
		: [];
	if (domain?.provider !== "cloudflare") {
		throw new Error(`Sending is not set up for ${hostname ?? "this domain"}. Choose a sending provider on the Domains page.`);
	}
	return { provider: "cloudflare" };
}

export async function sendThroughProvider(
	env: CloudflareEnv,
	_config: OutboundProviderConfig,
	message: OutboundProviderMessage,
	_idempotencyKey?: string,
): Promise<{ messageId: string }> {
	const response = await env.EMAIL.send({
		from: message.from,
		to: message.to,
		...(message.cc?.length ? { cc: message.cc } : {}),
		...(message.bcc?.length ? { bcc: message.bcc } : {}),
		subject: message.subject,
		headers: message.headers && Object.keys(message.headers).length ? message.headers : undefined,
		html: message.html,
		text: message.text,
		attachments: message.attachments?.map((attachment) =>
			attachment.disposition === "inline" && attachment.contentId
				? { filename: attachment.filename, type: attachment.type, content: attachment.content, disposition: "inline" as const, contentId: attachment.contentId }
				: { filename: attachment.filename, type: attachment.type, content: attachment.content, disposition: "attachment" as const },
		),
	});
	return { messageId: response.messageId };
}
