// Fork-only. The provider's ES256 signing keys, kept in D1 and created on first use.
import { desc, isNull } from "drizzle-orm";
import { getDb } from "#db";
import { oidcSigningKeys } from "#db/schema";
import { randomToken } from "./jwt";

const ES256_KEY = { name: "ECDSA", namedCurve: "P-256" } as const;

export type PublicJwk = JsonWebKey & { kid: string; use: "sig"; alg: "ES256" };

type CachedKeys = { loadedAt: number; signing: { kid: string; privateKey: CryptoKey }; publicKeys: Map<string, { jwk: PublicJwk; key: CryptoKey }> };

// Keys change only when one is created, so an isolate can reuse them for a few minutes.
const CACHE_MS = 5 * 60_000;
let cache: CachedKeys | null = null;

function publicPart(jwk: JsonWebKey, kid: string): PublicJwk {
	return { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, kid, use: "sig", alg: "ES256" };
}

async function createSigningKey(env: CloudflareEnv) {
	const pair = (await crypto.subtle.generateKey(ES256_KEY, true, ["sign", "verify"])) as CryptoKeyPair;
	const privateJwk = (await crypto.subtle.exportKey("jwk", pair.privateKey)) as JsonWebKey;
	const kid = randomToken(12);
	await getDb(env).insert(oidcSigningKeys).values({
		kid,
		privateJwk: JSON.stringify(privateJwk),
		publicJwk: JSON.stringify(publicPart(privateJwk, kid)),
		createdAt: new Date(),
	});
}

async function load(env: CloudflareEnv): Promise<CachedKeys> {
	if (cache && Date.now() - cache.loadedAt < CACHE_MS) return cache;
	const db = getDb({ DB: env.DB_PRIMARY ?? env.DB });
	let rows = await db.select().from(oidcSigningKeys).where(isNull(oidcSigningKeys.retiredAt)).orderBy(desc(oidcSigningKeys.createdAt));
	if (rows.length === 0) {
		await createSigningKey(env);
		rows = await db.select().from(oidcSigningKeys).where(isNull(oidcSigningKeys.retiredAt)).orderBy(desc(oidcSigningKeys.createdAt));
	}
	const newest = rows[0];
	const privateKey = await crypto.subtle.importKey("jwk", JSON.parse(newest.privateJwk) as JsonWebKey, ES256_KEY, false, ["sign"]);
	const publicKeys = new Map<string, { jwk: PublicJwk; key: CryptoKey }>();
	for (const row of rows) {
		const jwk = JSON.parse(row.publicJwk) as PublicJwk;
		publicKeys.set(row.kid, { jwk, key: await crypto.subtle.importKey("jwk", jwk, ES256_KEY, false, ["verify"]) });
	}
	cache = { loadedAt: Date.now(), signing: { kid: newest.kid, privateKey }, publicKeys };
	return cache;
}

export async function getSigningKey(env: CloudflareEnv) {
	return (await load(env)).signing;
}

export async function getVerificationKey(env: CloudflareEnv, kid: string): Promise<CryptoKey | null> {
	return (await load(env)).publicKeys.get(kid)?.key ?? null;
}

export async function getJwks(env: CloudflareEnv): Promise<{ keys: PublicJwk[] }> {
	return { keys: [...(await load(env)).publicKeys.values()].map((entry) => entry.jwk) };
}

/** For tests. */
export function resetSigningKeyCache() {
	cache = null;
}
