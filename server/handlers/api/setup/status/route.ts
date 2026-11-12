import { NextResponse } from "#lib/http/next-compat";
import { hasAdminAccount } from "#lib/auth/setup";
import { getEnv } from "#lib/cloudflare";
import { getPrimaryDomain } from "#lib/user";
import { isMissingTableError } from "#lib/database-errors";

export async function GET() {
	const env = getEnv();
	try {
		const [adminAccountExists, domain] = await Promise.all([
			hasAdminAccount(env),
			// Before first-run setup migrates it, the database has no tables: no admin and no domain.
			getPrimaryDomain(env).catch((error) => {
				if (isMissingTableError(error)) return null;
				throw error;
			}),
		]);
		return NextResponse.json({
			hasAdminAccount: adminAccountExists,
			hasPrimaryDomain: !!domain,
			primaryDomain: domain
				? { hostname: domain.hostname, sendingRequested: domain.sendingRequested }
				: null,
		}, {
			headers: { "Cache-Control": "no-store" },
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Could not load setup status";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
