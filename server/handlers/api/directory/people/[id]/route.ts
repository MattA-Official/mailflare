// Fork-only: one person in the directory. GET for everyone signed in; PATCH for user admins, or the person
// themselves (see updateProfileResponse for which fields they may change).
import { NextResponse } from "#lib/http/next-compat";
import { getDb } from "#db";
import { isDirectoryAdmin, requireDirectoryReader, updateProfileResponse } from "#lib/directory/api";
import { EMPTY_PROFILE, loadDirectory, personDetail } from "#lib/directory/service";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
	const access = await requireDirectoryReader(request);
	if (access.error) return access.error;
	const { id } = await params;
	const snapshot = await loadDirectory(getDb(access.env));
	const person = snapshot.people.find((item) => item.id === id);
	if (!person) return NextResponse.json({ error: "Person not found" }, { status: 404 });
	const admin = isDirectoryAdmin(access.user);
	const self = access.user.id === id;
	const canEdit = snapshot.profilesAvailable && (admin || self);
	return NextResponse.json({
		person: personDetail(snapshot, person),
		isMe: self,
		profilesAvailable: snapshot.profilesAvailable,
		canEdit,
		canEditOrg: snapshot.profilesAvailable && (admin || (self && snapshot.settings.selfEditOrg)),
		isAdmin: admin,
		// For the profile editor: the stored fields (the manager may be hidden from the chain above) and who can be the manager.
		...(canEdit ? {
			profile: { ...EMPTY_PROFILE, ...snapshot.allProfiles.get(id) },
			managerOptions: snapshot.people.filter((item) => item.id !== id).map((item) => ({ id: item.id, name: item.name, email: item.email })),
		} : {}),
	});
}

export async function PATCH(request: Request, { params }: Params) {
	const access = await requireDirectoryReader(request);
	if (access.error) return access.error;
	const { id } = await params;
	return updateProfileResponse(request, access.user, id);
}
