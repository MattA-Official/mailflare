import { NextResponse } from "#lib/http/next-compat";
import { getEnv } from "#lib/cloudflare";
import { authenticateAdminApiKey } from "#lib/api/admin-auth";
import { getStorageStatus, testStorage } from "#lib/storage/health";

/** Which object storage is active. Always the R2 binding in this fork; the shape is upstream's. */
export async function GET(request: Request) {
	const env = getEnv();
	const auth = await authenticateAdminApiKey(env, request, "storage");
	if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	return NextResponse.json({ storage: getStorageStatus(), warning: null });
}

/** Round-trips a small object through the active storage. */
export async function POST(request: Request) {
	const env = getEnv();
	const auth = await authenticateAdminApiKey(env, request, "storage");
	if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	const result = await testStorage(env);
	return NextResponse.json({ storage: getStorageStatus(), ...result }, { status: result.ok ? 200 : 502 });
}
