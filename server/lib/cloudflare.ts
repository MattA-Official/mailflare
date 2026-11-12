import { env } from "cloudflare:workers";

/**
 * The Worker's bindings. Works in request handlers and in the email, queue, cron and Durable Object
 * contexts. Keep binding access going through here.
 */
export function getEnv(): CloudflareEnv {
	return env as unknown as CloudflareEnv;
}

export async function getEnvAsync(): Promise<CloudflareEnv> {
	return getEnv();
}
