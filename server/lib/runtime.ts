/**
 * Upstream also runs on a self-hosted Node server. This fork is Workers only; these helpers remain so
 * ported code compiles, and the Node branches behind them are dead.
 */
export function getNodeEnv(): CloudflareEnv | undefined {
	return undefined;
}

export function isNodeRuntime(_env?: unknown): boolean {
	return false;
}

/** True when the app can talk to the Cloudflare API to manage zones and routing. */
export function hasCloudflareCredentials(env: Pick<CloudflareEnv, "CF_TOKEN" | "CF_API_KEY" | "CF_EMAIL">): boolean {
	return !!env.CF_TOKEN?.trim() || (!!env.CF_API_KEY?.trim() && !!env.CF_EMAIL?.trim());
}
