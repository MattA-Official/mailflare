import { eq, sql } from "drizzle-orm";
import { getDb } from "#db";
import { appSettings, driveItems, sharedDrives } from "#db/schema";

/** Per-user Drive cap in bytes, or null for unlimited. Set by the admin on the General page. */
export async function getDriveStorageLimit(env: CloudflareEnv): Promise<number | null> {
	const [settings] = await getDb(env).select({ limit: appSettings.driveStorageLimitBytes }).from(appSettings).where(eq(appSettings.id, "default")).limit(1);
	return settings?.limit && settings.limit > 0 ? settings.limit : null;
}

export async function getDriveStorageUsed(db: ReturnType<typeof getDb>, ownerId: string): Promise<number> {
	const [usage] = await db.select({ total: sql<number>`coalesce(sum(${driveItems.size}), 0)` }).from(driveItems).where(eq(driveItems.ownerId, ownerId));
	return Number(usage?.total ?? 0);
}

/**
 * Fork-only: the cap that applies to files owned by `ownerId`. A shared drive has its own cap (null is unlimited);
 * anyone else has the instance-wide per-person cap.
 */
export async function getDriveStorageLimitFor(env: CloudflareEnv, db: ReturnType<typeof getDb>, ownerId: string): Promise<number | null> {
	const [drive] = await db.select({ limit: sharedDrives.storageLimitBytes }).from(sharedDrives).where(eq(sharedDrives.id, ownerId)).limit(1);
	if (drive) return drive.limit && drive.limit > 0 ? drive.limit : null;
	return getDriveStorageLimit(env);
}
