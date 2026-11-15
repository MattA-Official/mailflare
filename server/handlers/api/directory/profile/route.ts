// Fork-only: the signed-in person's own directory profile, for Settings -> Account.
import { NextResponse } from "#lib/http/next-compat";
import { getDb } from "#db";
import { isDirectoryAdmin, requireDirectoryReader, updateProfileResponse } from "#lib/directory/api";
import { loadDirectory, loadDirectorySettings, loadProfiles } from "#lib/directory/service";

export async function GET(request: Request) {
	const access = await requireDirectoryReader(request);
	if (access.error) return access.error;
	const db = getDb(access.env);
	const [profiles, settings, snapshot] = await Promise.all([loadProfiles(db), loadDirectorySettings(db), loadDirectory(db)]);
	const profile = profiles?.get(access.user.id);
	const admin = isDirectoryAdmin(access.user);
	return NextResponse.json({
		profile: {
			title: profile?.title ?? null,
			department: profile?.department ?? null,
			phone: profile?.phone ?? null,
			location: profile?.location ?? null,
			pronouns: profile?.pronouns ?? null,
			about: profile?.about ?? null,
			reportsToUserId: profile?.reportsToUserId ?? null,
			hidden: profile?.hidden ?? false,
		},
		available: profiles !== null,
		canEditOrg: admin || settings.selfEditOrg,
		/** People who could be this person's manager. */
		managerOptions: snapshot.people.filter((person) => person.id !== access.user.id).map((person) => ({ id: person.id, name: person.name, email: person.email })),
	});
}

export async function PATCH(request: Request) {
	const access = await requireDirectoryReader(request);
	if (access.error) return access.error;
	return updateProfileResponse(request, access.user, access.user.id);
}
