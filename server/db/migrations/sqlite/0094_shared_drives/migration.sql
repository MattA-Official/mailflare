-- Fork-only: shared drives. A shared drive is a Drive tree held by a hidden account of its own (users.kind =
-- 'drive', the same pattern as the inbox principals of 0093), so it belongs to nobody and outlives everyone.
-- People and groups reach it only through drive_members. See server/lib/drive/shared-drives.ts.
CREATE TABLE `shared_drives` (
	`id` text PRIMARY KEY NOT NULL,
	`storage_limit_bytes` integer,
	`created_by_user_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `drive_members` (
	`id` text PRIMARY KEY NOT NULL,
	`drive_id` text NOT NULL,
	`user_id` text,
	`group_id` text,
	`role` text DEFAULT 'view' NOT NULL,
	`created_by_user_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`drive_id`) REFERENCES `shared_drives`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CHECK ((`user_id` IS NULL) <> (`group_id` IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `drive_members_drive_user_idx` ON `drive_members` (`drive_id`,`user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `drive_members_drive_group_idx` ON `drive_members` (`drive_id`,`group_id`);
--> statement-breakpoint
CREATE INDEX `drive_members_user_idx` ON `drive_members` (`user_id`);
--> statement-breakpoint
CREATE INDEX `drive_members_group_idx` ON `drive_members` (`group_id`);
