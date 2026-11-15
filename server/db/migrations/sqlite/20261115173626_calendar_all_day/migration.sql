CREATE TABLE `calendar_event_all_day` (
	`event_id` text PRIMARY KEY,
	CONSTRAINT `fk_calendar_event_all_day_event_id_calendar_events_id_fk` FOREIGN KEY (`event_id`) REFERENCES `calendar_events`(`id`) ON DELETE CASCADE
);
