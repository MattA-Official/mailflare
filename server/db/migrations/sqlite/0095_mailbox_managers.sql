-- Fork-only: shared inboxes hold themselves (0093), so a group no longer "owns" one. Any number of groups
-- can manage a shared inbox instead. A managing group always holds a full_access row in
-- mailbox_group_access, as an owning group did. Replaces mailbox_owner_groups (0091).
CREATE TABLE `mailbox_managers` (
	`mailbox_id` text NOT NULL,
	`group_id` text NOT NULL,
	`created_by_user_id` text,
	`created_at` integer NOT NULL,
	PRIMARY KEY (`mailbox_id`, `group_id`),
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailboxes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `mailbox_managers_group_idx` ON `mailbox_managers` (`group_id`);
--> statement-breakpoint
INSERT OR IGNORE INTO `mailbox_managers` (`mailbox_id`, `group_id`, `created_by_user_id`, `created_at`)
SELECT `mailbox_id`, `group_id`, `assigned_by_user_id`, `created_at` FROM `mailbox_owner_groups`;
--> statement-breakpoint
DROP TABLE `mailbox_owner_groups`;
