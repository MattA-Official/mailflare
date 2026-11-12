import type { NextResponse } from "#lib/http/next-compat";
import type { users } from "#db/schema";
import type { ApiAuthResult } from "#lib/api/key-auth-types";

export type CalendarAuthorization =
	| { user: typeof users.$inferSelect; key: ApiAuthResult | null; error: null }
	| { user: null; key: null; error: NextResponse };
