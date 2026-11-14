-- Fork-only: a shared inbox can be owned by a group. The owning group always has full access (kept as a
-- row in mailbox_group_access), and the inbox moves to the primary admin rather than being removed when
-- the admin account that holds it is deleted.
CREATE TABLE `mailbox_owner_groups` (
	`mailbox_id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`assigned_by_user_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailboxes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assigned_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `mailbox_owner_groups_group_idx` ON `mailbox_owner_groups` (`group_id`);
