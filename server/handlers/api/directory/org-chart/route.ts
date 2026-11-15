// Fork-only: what the org chart draws. Reporting lines come from each person's manager (hidden and disabled
// managers are skipped, so their reports move up); teams come from the nested groups.
import { NextResponse } from "#lib/http/next-compat";
import { getDb } from "#db";
import { isDirectoryAdmin, requireDirectoryReader } from "#lib/directory/api";
import { loadDirectory, orgChart } from "#lib/directory/service";

export async function GET(request: Request) {
	const access = await requireDirectoryReader(request);
	if (access.error) return access.error;
	const snapshot = await loadDirectory(getDb(access.env));
	return NextResponse.json({ ...orgChart(snapshot), profilesAvailable: snapshot.profilesAvailable, canReassign: snapshot.profilesAvailable && isDirectoryAdmin(access.user) });
}
