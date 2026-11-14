-- Fork-only: share a Drive file or folder with a group. Members get the role, like a share to a person;
-- a person's own share and every group share combine, and `edit` wins.
CREATE TABLE `drive_group_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`group_id` text NOT NULL,
	`role` text DEFAULT 'view' NOT NULL,
	`created_by_user_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `drive_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `drive_group_shares_item_group_idx` ON `drive_group_shares` (`item_id`,`group_id`);
--> statement-breakpoint
CREATE INDEX `drive_group_shares_group_idx` ON `drive_group_shares` (`group_id`);
