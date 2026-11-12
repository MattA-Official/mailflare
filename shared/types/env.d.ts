/// <reference types="@cloudflare/workers-types" />
// Bindings and variables of the Worker. Declared in nuxt.config.ts (nitro.cloudflare.wrangler).
interface CloudflareEnv {
	DB: D1Database;
	/** The raw D1 binding, kept on the primary while `DB` is a read-replica session (set by `withD1ReadSession`). */
	DB_PRIMARY?: D1Database;
	EMAIL: SendEmail;
	BUCKET: R2Bucket;
	INBOUND_QUEUE: Queue<import("../../server/lib/email/inbound").InboundQueueMessage>;
	AGENT_QUEUE?: Queue<{ kind: "agent.draft"; jobId: string }>;
	AI?: Ai;
	AI_MODEL?: string;
	AI_BASE_URL?: string;
	AI_API_KEY?: string;
	// The outbound queue also carries webhook retries and import job chunks so that scheduled redelivery needs no extra binding.
	OUTBOUND_QUEUE: Queue<
		| import("../../server/lib/email/send").OutboundQueueMessage
		| import("../../server/lib/email/webhooks").WebhookRetryMessage
		| import("../../server/lib/import/jobs-types").ImportJobMessage
	>;
	ASSETS: Fetcher;
	IMAGES: ImagesBinding;
	WORKER_SELF_REFERENCE: Fetcher;
	REALTIME: DurableObjectNamespace<
		import("../../server/realtime/hub").RealtimeHub
	>;
	LOGIN_RATE_LIMIT?: RateLimit;
	/** Mobile device sign-in (`/api/auth/device`), stricter than the web login. */
	DEVICE_LOGIN_RATE_LIMIT?: RateLimit;
	/** APNs auth key for the mobile push relay (src/lib/push/native.ts). */
	APNS_KEY_ID?: string;
	APNS_TEAM_ID?: string;
	/** The .p8 file contents (PKCS#8 PEM). */
	APNS_PRIVATE_KEY?: string;
	/** Origin of a Mailflare push relay (mailflare-relay); lets this server push without APNS_* keys. */
	APNS_RELAY_URL?: string;
	/** Spamhaus Data Query Service key; enables ZEN (sending IP) and DBL (domain) checks in spam analysis. */
	SPAMHAUS_DQS_KEY?: string;
	/** abuse.ch Auth-Key; enables URLhaus malware-host checks for links in incoming mail. */
	ABUSECH_AUTH_KEY?: string;
	/** "off" disables the RDAP domain-age check in spam analysis. */
	SPAM_DOMAIN_AGE_CHECK?: string;
	AGENT_RATE_LIMIT?: RateLimit;
	CF_TOKEN?: string;
	/** The deployed Worker name; Email Routing rules point at it. */
	CF_EMAIL_WORKER_NAME?: string;
	CF_API_KEY?: string;
	CF_EMAIL?: string;
	TURNSTILE_SECRET_KEY?: string;
	/** Cloudflare account id, used to list Workers AI models for the assistant settings. */
	CF_ACCOUNT_ID?: string;
	/** Public origin of this install (https://mail.example.com) when it sits behind a proxy. */
	APP_URL?: string;
	/** VAPID public key (uncompressed P-256 point, URL-safe base64) for Web Push. */
	VAPID_PUBLIC_KEY?: string;
	/** VAPID private scalar (URL-safe base64). Keep this secret. */
	VAPID_PRIVATE_KEY?: string;
	/** Contact URI for VAPID, e.g. mailto:admin@example.com or https://mail.example.com. */
	VAPID_SUBJECT?: string;
}
