import { escapeIcsText, formatIcsUtc, ICS_ADDRESS, joinIcsLines } from "./ics";
import { icsDate } from "./all-day";

type CalendarInvitationInput = {
	title: string;
	description: string;
	location: string;
	startsAt: Date;
	endsAt: Date;
	uid: string;
	/** PUBLISH is a plain event to add to a calendar, without organizer or RSVP. */
	method?: "REQUEST" | "CANCEL" | "PUBLISH";
	organizer?: string;
	attendees?: string[];
	/** (fork) Sent as dates rather than times, read in `timeZone`. */
	allDay?: boolean;
	timeZone?: string | null;
};

function dateLines(input: CalendarInvitationInput): string[] {
	if (input.allDay) return [`DTSTART;VALUE=DATE:${icsDate(input.startsAt, input.timeZone || "UTC")}`, `DTEND;VALUE=DATE:${icsDate(input.endsAt, input.timeZone || "UTC")}`];
	return [`DTSTART:${formatIcsUtc(input.startsAt)}`, `DTEND:${formatIcsUtc(input.endsAt)}`];
}

export function createCalendarInvitation(input: CalendarInvitationInput): ArrayBuffer {
	const organizer = input.method !== "PUBLISH" && input.organizer && ICS_ADDRESS.test(input.organizer) ? input.organizer : null;
	const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Mailflare//Calendar//EN", "CALSCALE:GREGORIAN", `METHOD:${input.method ?? "REQUEST"}`, "BEGIN:VEVENT", `UID:${input.uid}@mailflare`, `DTSTAMP:${formatIcsUtc(new Date())}`, ...dateLines(input), `SUMMARY:${escapeIcsText(input.title)}`, `DESCRIPTION:${escapeIcsText(input.description)}`, `LOCATION:${escapeIcsText(input.location)}`,
		...(organizer ? [`ORGANIZER:mailto:${organizer}`] : []),
		...(organizer ? (input.attendees ?? []).filter((address) => ICS_ADDRESS.test(address)).map((address) => `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${address}`) : []),
		"END:VEVENT", "END:VCALENDAR"];
	return new TextEncoder().encode(joinIcsLines(lines)).buffer as ArrayBuffer;
}
