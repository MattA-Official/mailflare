import { env } from "cloudflare:workers";
import { getD1Session, withD1Session } from "#lib/d1-session-context";

/**
 * The Worker's bindings. Works in request handlers and in the email, queue, cron and Durable Object
 * contexts. Keep binding access going through here. Inside a request served through a D1 read
 * session (see `server/worker/utils.ts`), `DB` is that session and `DB_PRIMARY` the raw binding.
 */
export function getEnv(): CloudflareEnv {
	const base = env as unknown as CloudflareEnv;
	const session = getD1Session();
	return session ? withD1Session(base, session) : base;
}

export async function getEnvAsync(): Promise<CloudflareEnv> {
	return getEnv();
}
