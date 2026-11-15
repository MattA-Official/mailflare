CREATE TABLE `directory_settings` (
	`id` text PRIMARY KEY,
	`self_edit_org` integer DEFAULT true NOT NULL,
	`org_root_user_id` text,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_directory_settings_org_root_user_id_users_id_fk` FOREIGN KEY (`org_root_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `user_profiles` (
	`user_id` text PRIMARY KEY,
	`title` text,
	`department` text,
	`phone` text,
	`location` text,
	`pronouns` text,
	`about` text,
	`reports_to_user_id` text,
	`hidden` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_user_profiles_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_user_profiles_reports_to_user_id_users_id_fk` FOREIGN KEY (`reports_to_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX `user_profiles_reports_to_idx` ON `user_profiles` (`reports_to_user_id`);