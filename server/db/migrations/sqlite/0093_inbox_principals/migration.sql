-- Fork-only: shared inboxes hold themselves. Each shared inbox is held by its own hidden account (an "inbox
-- principal", users.kind = 'inbox') instead of by the admin who created it. The principal cannot sign in; it
-- exists so that everything upstream keys by user_id (stored mail, folders, contacts, spam and trash
-- settings) belongs to the inbox. People reach the inbox only through mailbox_access and
-- mailbox_group_access grants. See server/lib/mailboxes/principals.ts.
ALTER TABLE `users` ADD `kind` text DEFAULT 'person' NOT NULL;
--> statement-breakpoint
CREATE INDEX `users_kind_idx` ON `users` (`kind`);
--> statement-breakpoint
-- One principal per existing shared inbox, carrying the holding admin's mail settings so nothing changes.
INSERT INTO `users` (`id`, `email`, `password_hash`, `name`, `role`, `kind`, `spam_protection_enabled`, `trash_retention_days`, `remote_content_mode`, `show_full_recipient_addresses`, `created_at`)
SELECT 'inbox_' || m.`id`, m.`id` || '@inbox.invalid', '!passkey-only', COALESCE(NULLIF(TRIM(m.`display_name`), ''), m.`local_part`), 'user', 'inbox',
	u.`spam_protection_enabled`, u.`trash_retention_days`, u.`remote_content_mode`, u.`show_full_recipient_addresses`, unixepoch()
FROM `mailboxes` m
INNER JOIN `users` u ON u.`id` = m.`user_id`
WHERE m.`type` = 'shared' AND u.`kind` = 'person';
--> statement-breakpoint
-- The admin who held each inbox keeps full access through an ordinary grant.
INSERT INTO `mailbox_access` (`id`, `mailbox_id`, `user_id`, `permission`, `created_by_user_id`, `created_at`)
SELECT 'mba_inbox_' || m.`id`, m.`id`, m.`user_id`, 'full_access', m.`user_id`, unixepoch()
FROM `mailboxes` m
INNER JOIN `users` h ON h.`id` = m.`user_id` AND h.`kind` = 'person'
WHERE m.`type` = 'shared' AND EXISTS (SELECT 1 FROM `users` p WHERE p.`id` = 'inbox_' || m.`id`)
ON CONFLICT (`mailbox_id`, `user_id`) DO UPDATE SET `permission` = 'full_access';
--> statement-breakpoint
-- Blocked senders and senders allowed to load remote content keep applying to the inbox's mail.
INSERT OR IGNORE INTO `contacts` (`id`, `user_id`, `email`, `display_name`, `source`, `blocked`, `remote_content_allowed`, `last_seen_at`, `created_at`)
SELECT 'ctc_inbox_' || m.`id` || '_' || c.`id`, 'inbox_' || m.`id`, c.`email`, c.`display_name`, c.`source`, c.`blocked`, c.`remote_content_allowed`, c.`last_seen_at`, c.`created_at`
FROM `mailboxes` m
INNER JOIN `users` h ON h.`id` = m.`user_id` AND h.`kind` = 'person'
INNER JOIN `contacts` c ON c.`user_id` = m.`user_id`
WHERE m.`type` = 'shared' AND (c.`blocked` = 1 OR c.`remote_content_allowed` = 1)
	AND EXISTS (SELECT 1 FROM `users` p WHERE p.`id` = 'inbox_' || m.`id`);
--> statement-breakpoint
-- Mail that arrived in the inbox and its folders move to the principal. Drafts and sent mail stay with the
-- person who wrote them, as they already do for everyone else given the inbox.
UPDATE `messages` SET `user_id` = 'inbox_' || `mailbox_id`
WHERE `direction` = 'inbound'
	AND `mailbox_id` IN (SELECT m.`id` FROM `mailboxes` m WHERE m.`type` = 'shared' AND m.`user_id` = `messages`.`user_id`)
	AND EXISTS (SELECT 1 FROM `users` p WHERE p.`id` = 'inbox_' || `messages`.`mailbox_id`);
--> statement-breakpoint
UPDATE `folders` SET `user_id` = 'inbox_' || `mailbox_id`
WHERE `mailbox_id` IN (SELECT m.`id` FROM `mailboxes` m WHERE m.`type` = 'shared' AND m.`user_id` = `folders`.`user_id`)
	AND EXISTS (SELECT 1 FROM `users` p WHERE p.`id` = 'inbox_' || `folders`.`mailbox_id`);
--> statement-breakpoint
-- Last, the inbox itself.
UPDATE `mailboxes` SET `user_id` = 'inbox_' || `id`
WHERE `type` = 'shared' AND EXISTS (SELECT 1 FROM `users` p WHERE p.`id` = 'inbox_' || `mailboxes`.`id`);
