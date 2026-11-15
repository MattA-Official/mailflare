// Fork-only: a person's photo for the directory, readable by everyone signed in.
import { getDb } from "#db";
import { getAvatarImageResponse } from "#lib/avatar-images";
import { requireDirectoryReader } from "#lib/directory/api";
import { directoryAvatarKey } from "#lib/directory/service";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
	const access = await requireDirectoryReader(request);
	if (access.error) return new Response("Unauthorized", { status: 401 });
	const { id } = await params;
	const key = await directoryAvatarKey(getDb(access.env), id);
	if (!key) return new Response("Not found", { status: 404 });
	return getAvatarImageResponse(request, access.env.BUCKET, key);
}
