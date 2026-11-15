// (fork) All-day events: midnight to midnight in the event's time zone, marked by a row in
// calendar_event_all_day. That table comes from a migration that may not be applied yet, so reads
// treat a missing table as "no all-day events" and writes skip the mark, leaving a plain
// midnight-to-midnight event.
import { eq } from "drizzle-orm";
import { calendarEventAllDay, calendarEvents } from "#db/schema";
import type { getDb } from "#db";
import { isMissingTableError } from "#lib/database-errors";
import { zonedDateFields } from "#lib/time/utils";

type Database = ReturnType<typeof getDb>;

/** Ids of a user's all-day events. */
export async function loadAllDayEventIds(db: Database, userId: string): Promise<Set<string>> {
	try {
		const rows = await db.select({ id: calendarEventAllDay.eventId }).from(calendarEventAllDay)
			.innerJoin(calendarEvents, eq(calendarEvents.id, calendarEventAllDay.eventId))
			.where(eq(calendarEvents.userId, userId));
		return new Set(rows.map((row) => row.id));
	} catch (error) {
		if (isMissingTableError(error)) return new Set();
		throw error;
	}
}

export async function isAllDayEvent(db: Database, eventId: string): Promise<boolean> {
	try {
		const [row] = await db.select({ id: calendarEventAllDay.eventId }).from(calendarEventAllDay).where(eq(calendarEventAllDay.eventId, eventId)).limit(1);
		return Boolean(row);
	} catch (error) {
		if (isMissingTableError(error)) return false;
		throw error;
	}
}

/** Marks or unmarks an event as all-day. Returns whether the mark could be stored. */
export async function setAllDayEvent(db: Database, eventId: string, allDay: boolean): Promise<boolean> {
	try {
		if (allDay) await db.insert(calendarEventAllDay).values({ eventId }).onConflictDoNothing();
		else await db.delete(calendarEventAllDay).where(eq(calendarEventAllDay.eventId, eventId));
		return true;
	} catch (error) {
		if (isMissingTableError(error)) return false;
		throw error;
	}
}

/** "YYYYMMDD" of the day an instant falls on in a zone, for VALUE=DATE properties. */
export function icsDate(value: Date, timeZone: string): string {
	return zonedDateFields(value, timeZone).toISOString().slice(0, 10).replace(/-/g, "");
}
