-- Fork-only: Mailflare as an OpenID Connect provider for staff apps.
-- How a session was signed in, as a JSON array of RFC 8176 method values ("pwd", "otp", "hwk", "swk").
-- Null on sessions from before this column, which count as password-only.
ALTER TABLE `sessions` ADD `amr` text;
--> statement-breakpoint
CREATE TABLE `oidc_apps` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`name` text NOT NULL,
	`homepage_url` text,
	`redirect_uris` text DEFAULT '[]' NOT NULL,
	`roles` text DEFAULT '[]' NOT NULL,
	`client_secret_hash` text,
	`client_secret_prefix` text,
	`disabled` integer DEFAULT false NOT NULL,
	`created_by_user_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oidc_apps_client_id_idx` ON `oidc_apps` (`client_id`);
--> statement-breakpoint
CREATE TABLE `oidc_app_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`user_id` text NOT NULL,
	`roles` text DEFAULT '[]' NOT NULL,
	`granted_by_user_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `oidc_apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`granted_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oidc_app_roles_app_user_idx` ON `oidc_app_roles` (`app_id`,`user_id`);
--> statement-breakpoint
CREATE INDEX `oidc_app_roles_user_idx` ON `oidc_app_roles` (`user_id`);
--> statement-breakpoint
CREATE TABLE `oidc_authorization_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`code_hash` text NOT NULL,
	`app_id` text NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`redirect_uri` text NOT NULL,
	`code_challenge` text NOT NULL,
	`scope` text NOT NULL,
	`nonce` text,
	`auth_time` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `oidc_apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oidc_authorization_codes_code_hash_idx` ON `oidc_authorization_codes` (`code_hash`);
--> statement-breakpoint
CREATE INDEX `oidc_authorization_codes_expires_idx` ON `oidc_authorization_codes` (`expires_at`);
--> statement-breakpoint
CREATE TABLE `oidc_refresh_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`family_id` text NOT NULL,
	`app_id` text NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`scope` text NOT NULL,
	`auth_time` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `oidc_apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oidc_refresh_tokens_token_hash_idx` ON `oidc_refresh_tokens` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `oidc_refresh_tokens_family_idx` ON `oidc_refresh_tokens` (`family_id`);
--> statement-breakpoint
CREATE INDEX `oidc_refresh_tokens_expires_idx` ON `oidc_refresh_tokens` (`expires_at`);
--> statement-breakpoint
CREATE TABLE `oidc_signing_keys` (
	`kid` text PRIMARY KEY NOT NULL,
	`private_jwk` text NOT NULL,
	`public_jwk` text NOT NULL,
	`created_at` integer NOT NULL,
	`retired_at` integer
);
