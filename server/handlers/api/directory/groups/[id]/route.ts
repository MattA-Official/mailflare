// Fork-only: one group as the directory shows it: members and managers, parent and child groups, and the shared
// inboxes it manages. Unlike /api/groups/:id, every signed-in person can read it, and it shows no access levels.
import { NextResponse } from "#lib/http/next-compat";
import { getDb } from "#db";
import { requireDirectoryReader } from "#lib/directory/api";
import { groupDetail, loadDirectory } from "#lib/directory/service";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
	const access = await requireDirectoryReader(request);
	if (access.error) return access.error;
	const { id } = await params;
	const snapshot = await loadDirectory(getDb(access.env));
	const group = snapshot.groups.find((item) => item.id === id);
	if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });
	return NextResponse.json({ group: groupDetail(snapshot, group) });
}
