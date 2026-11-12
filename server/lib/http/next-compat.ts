import { getCookie, setCookie, deleteCookie, getRequestHeaders, type H3Event } from "h3";
import { useEvent } from "nitropack/runtime";

/**
 * A small stand-in for the parts of `next/server` and `next/headers` the ported route handlers use.
 * Handlers under server/handlers were moved across from the Next.js app unchanged; they build web
 * `Response`s, which Nitro returns as they are. New code should use h3 helpers directly.
 */
export interface CookieOptions {
	httpOnly?: boolean;
	secure?: boolean;
	sameSite?: "lax" | "strict" | "none" | boolean;
	path?: string;
	maxAge?: number;
	expires?: Date;
	domain?: string;
}

function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
	const parts = [`${name}=${encodeURIComponent(value)}`];
	parts.push(`Path=${options.path ?? "/"}`);
	if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
	if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
	if (options.domain) parts.push(`Domain=${options.domain}`);
	if (options.httpOnly) parts.push("HttpOnly");
	if (options.secure) parts.push("Secure");
	if (options.sameSite) {
		const sameSite = options.sameSite === true ? "strict" : options.sameSite;
		parts.push(`SameSite=${sameSite.charAt(0).toUpperCase()}${sameSite.slice(1)}`);
	}
	return parts.join("; ");
}

class ResponseCookies {
	constructor(private readonly headers: Headers) {}
	set(name: string, value: string, options?: CookieOptions): this {
		this.headers.append("Set-Cookie", serializeCookie(name, value, options));
		return this;
	}
	delete(name: string): this {
		return this.set(name, "", { maxAge: 0 });
	}
}

export class NextResponse<_Body = unknown> extends Response {
	readonly cookies: ResponseCookies;

	constructor(body?: BodyInit | null, init?: ResponseInit) {
		super(body, init);
		this.cookies = new ResponseCookies(this.headers);
	}

	static override json<T>(data: T, init?: ResponseInit): NextResponse<T> {
		const headers = new Headers(init?.headers);
		if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
		return new NextResponse<T>(JSON.stringify(data), { ...init, headers });
	}

	static override redirect(url: string | URL, status: number | ResponseInit = 307): NextResponse {
		const init = typeof status === "number" ? { status } : status;
		const headers = new Headers(init.headers);
		headers.set("Location", String(url));
		return new NextResponse(null, { ...init, status: init.status ?? 307, headers });
	}
}

/** The incoming request, with Next's `nextUrl` convenience. */
export type NextRequest = Request & { nextUrl: URL };

export function toNextRequest(request: Request): NextRequest {
	Object.defineProperty(request, "nextUrl", { value: new URL(request.url), configurable: true });
	return request as NextRequest;
}

function currentEvent(): H3Event {
	return useEvent();
}

/** `cookies()` from next/headers, backed by the current h3 event (needs nitro.experimental.asyncContext). */
export async function cookies() {
	const event = currentEvent();
	return {
		get(name: string): { name: string; value: string } | undefined {
			const value = getCookie(event, name);
			return value === undefined ? undefined : { name, value };
		},
		set(name: string, value: string, options?: CookieOptions) {
			setCookie(event, name, value, options as never);
		},
		delete(name: string) {
			deleteCookie(event, name);
		},
	};
}

/** `headers()` from next/headers. */
export async function headers(): Promise<Headers> {
	return new Headers(getRequestHeaders(currentEvent()) as Record<string, string>);
}
