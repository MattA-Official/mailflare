// Fork-only: the instance directory (contacts plan, phase 2). Every signed-in person can read it.
// GET ?q= returns the people, groups and shared inboxes that match, with the departments for the filter.
import { NextResponse } from "#lib/http/next-compat";
import { getDb } from "#db";
import { isDirectoryAdmin, requireDirectoryReader } from "#lib/directory/api";
import { departments, loadDirectory, personSummary, searchGroups, searchInboxes, searchPeople } from "#lib/directory/service";

export async function GET(request: Request) {
	const access = await requireDirectoryReader(request);
	if (access.error) return access.error;
	const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 200) ?? "";
	const snapshot = await loadDirectory(getDb(access.env));
	return NextResponse.json({
		people: searchPeople(snapshot, query).map((person) => ({ ...personSummary(person), groupIds: person.groups.map((group) => group.id) })),
		groups: searchGroups(snapshot, query).map((group) => ({ id: group.id, name: group.name, description: group.description, memberCount: group.memberIds.length })),
		inboxes: searchInboxes(snapshot, query),
		departments: departments(snapshot),
		profilesAvailable: snapshot.profilesAvailable,
		isAdmin: isDirectoryAdmin(access.user),
	});
}
