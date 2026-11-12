import { NextResponse } from "#lib/http/next-compat";
import { getCurrentUser } from "#lib/auth/cookies";
import { getEnv } from "#lib/cloudflare";
import { hasPrimaryDomain, userHasMailboxes } from "#lib/user";
import { hasCloudflareCredentials } from "#lib/cloudflare-api-utils";

export async function GET(request: Request) {
	const env = getEnv();
	const user = await getCurrentUser(env, request);
	if (!user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	// Authentication remains valid when optional mailbox/setup metadata is unavailable.
	const [hasMailboxes, isSetup] = await Promise.all([
		userHasMailboxes(env, user.id),
		hasPrimaryDomain(env),
	]).catch((): [boolean, boolean] => [false, true]);
	return NextResponse.json({
		user: {
			id: user.id,
			email: user.email,
			name: user.name,
			timeZone: user.timeZone,
			resetEmail: user.resetEmail,
			forwardingEmail: user.forwardingEmail,
			canForwardEmail: true,
			role: user.role,
			isPrimaryAdmin: user.isPrimaryAdmin,
			canManageMailboxes: user.canManageMailboxes,
			canManageDomains: user.canManageDomains,
			canManageUsers: user.canManageUsers,
			calendarEnabled: user.calendarEnabled,
			driveEnabled: user.driveEnabled,
			keyboardShortcutsEnabled: user.keyboardShortcutsEnabled,
			spamProtectionEnabled: user.spamProtectionEnabled,
			showFullRecipientAddresses: user.showFullRecipientAddresses,
			hasAvatar: !!user.avatarKey,
			mfaEnabled: user.totpEnabled,
		},
		runtime: "cloudflare",
		managesDns: hasCloudflareCredentials(env),
		hasMailboxes,
		isSetup,
	});
}
