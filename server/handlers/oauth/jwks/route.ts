// Fork-only. The provider's public signing keys.
import { getEnv } from "#lib/cloudflare";
import { publicJson } from "#lib/oidc/http";
import { getJwks } from "#lib/oidc/keys";

export async function GET() {
	return publicJson(await getJwks(getEnv()));
}

export const dynamic = "force-dynamic";
