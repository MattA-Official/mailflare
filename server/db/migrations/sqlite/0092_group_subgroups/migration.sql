-- Fork-only: groups inside groups. A group can sit inside several groups and hold several sub-groups.
-- Whatever is shared with a group also reaches every group beneath it; nothing flows back up. Removing a
-- link, or deleting either group, simply ends what passed through it. The app refuses links that loop.
CREATE TABLE `group_subgroups` (
	`parent_group_id` text NOT NULL,
	`child_group_id` text NOT NULL,
	`added_by_user_id` text,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`parent_group_id`, `child_group_id`),
	FOREIGN KEY (`parent_group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`child_group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`added_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `group_subgroups_child_idx` ON `group_subgroups` (`child_group_id`);
