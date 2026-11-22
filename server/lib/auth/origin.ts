/**
 * The origin browsers use to reach this app, which a same-origin request must carry. On Workers
 * `request.url` is the public URL. (Upstream also derives it from APP_URL or the Host header for its
 * self-hosted Node server, which the fork does not run.)
 */
export function expectedRequestOrigin(request: Request): string {
	return new URL(request.url).origin;
}

/**
 * Strict same-origin test for a state-changing browser request that authenticates by cookie.
 * The request must prove it comes from this app's own pages: `Sec-Fetch-Site: same-origin`, or an
 * `Origin` equal to the expected origin. A missing Origin is not accepted on its own (a form post
 * from a sibling subdomain or an old client may omit it), and `same-site` never is.
 */
export function isSameOriginRequest(request: Request, expectedOrigin: string = expectedRequestOrigin(request)): boolean {
	const fetchSite = request.headers.get("Sec-Fetch-Site");
	if (fetchSite === "same-origin") return true;
	if (fetchSite === "cross-site" || fetchSite === "same-site") return false;
	const origin = request.headers.get("Origin");
	return origin !== null && origin === expectedOrigin;
}

/** Call only after session authentication. Bearer tokens are not sent automatically by browsers. */
export function hasValidSessionMutationOrigin(request: Request, expectedOrigin?: string): boolean {
	if (request.headers.get("Authorization")?.startsWith("Bearer ")) return true;
	return isSameOriginRequest(request, expectedOrigin);
}
