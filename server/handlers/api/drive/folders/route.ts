import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "#lib/http/next-compat";
import { driveItems } from "#db/schema";
import { authorizeDrive } from "#lib/drive/auth";
import { withoutTrashedAncestors } from "#lib/drive/access";
import { driveRoleForMember, getSharedDriveRole } from "#lib/drive/shared-drives";
import { canEditDrive } from "#lib/drive/utils";

/**
 * Every folder the user owns (not trashed), flat; the client builds the tree for the "Move to folder" menu.
 * Fork: with `?drive=<id>`, the folders of a shared drive the user can edit.
 */
export async function GET(request: Request) {
	const auth = await authorizeDrive(request);
	if (auth.error) return auth.error;
	const { db, user } = auth;
	let ownerId = user.id;
	const driveId = new URL(request.url).searchParams.get("drive");
	if (driveId) {
		const role = await getSharedDriveRole(db, user, driveId);
		if (!role || !canEditDrive(driveRoleForMember(role))) return NextResponse.json({ error: "Drive not found" }, { status: 404 });
		ownerId = driveId;
	}
	const rows = await db.select().from(driveItems).where(and(eq(driveItems.ownerId, ownerId), eq(driveItems.kind, "folder"), isNull(driveItems.trashedAt))).limit(2000);
	const folders = await withoutTrashedAncestors(db, rows);
	return NextResponse.json({ folders: folders.map((folder) => ({ id: folder.id, name: folder.name, parentId: folder.parentId })) });
}
