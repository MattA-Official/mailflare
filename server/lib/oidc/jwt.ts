// Fork-only. Compact JWS (ES256) signing and verification with WebCrypto, for the OIDC provider.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function base64UrlEncode(input: ArrayBuffer | Uint8Array | string): string {
	const bytes = typeof input === "string" ? encoder.encode(input) : input instanceof Uint8Array ? input : new Uint8Array(input);
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(input: string): Uint8Array<ArrayBuffer> {
	const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
	const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
	const binary = atob(padded);
	const bytes = new Uint8Array(new ArrayBuffer(binary.length));
	for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
	return bytes;
}

export type JwtHeader = { alg: "ES256"; kid: string; typ: string };
export type JwtPayload = Record<string, unknown>;

const ES256 = { name: "ECDSA", hash: "SHA-256" } as const;

export async function signJwt(payload: JwtPayload, key: { kid: string; privateKey: CryptoKey }, typ = "JWT"): Promise<string> {
	const header: JwtHeader = { alg: "ES256", kid: key.kid, typ };
	const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
	const signature = await crypto.subtle.sign(ES256, key.privateKey, encoder.encode(signingInput));
	return `${signingInput}.${base64UrlEncode(signature)}`;
}

/**
 * Verifies a token's signature against the key its `kid` names and returns the header and payload.
 * Claims (issuer, audience, expiry) are the caller's to check. Returns null for anything malformed.
 */
export async function verifyJwt(
	token: string,
	findKey: (kid: string) => Promise<CryptoKey | null>,
): Promise<{ header: JwtHeader; payload: JwtPayload } | null> {
	const parts = token.split(".");
	if (parts.length !== 3) return null;
	try {
		const header = JSON.parse(decoder.decode(base64UrlDecode(parts[0]))) as JwtHeader;
		if (header.alg !== "ES256" || typeof header.kid !== "string") return null;
		const key = await findKey(header.kid);
		if (!key) return null;
		const valid = await crypto.subtle.verify(ES256, key, base64UrlDecode(parts[2]), encoder.encode(`${parts[0]}.${parts[1]}`));
		if (!valid) return null;
		const payload = JSON.parse(decoder.decode(base64UrlDecode(parts[1]))) as JwtPayload;
		if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
		return { header, payload };
	} catch {
		return null;
	}
}

export async function sha256Hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** PKCE S256: base64url(SHA-256(verifier)). */
export async function pkceChallenge(verifier: string): Promise<string> {
	return base64UrlEncode(await crypto.subtle.digest("SHA-256", encoder.encode(verifier)));
}

/** A URL-safe random secret with `bytes` bytes of entropy. */
export function randomToken(bytes = 32): string {
	return base64UrlEncode(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** Compares two strings in time that depends only on their length. */
export function timingSafeEqual(left: string, right: string): boolean {
	if (left.length !== right.length) return false;
	let difference = 0;
	for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
	return difference === 0;
}
