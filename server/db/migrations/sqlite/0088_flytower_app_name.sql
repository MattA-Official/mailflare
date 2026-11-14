-- Fork-only: installs still called the upstream default take the Flytower name. A name set on the
-- Branding page is left alone.
UPDATE `app_settings` SET `app_name` = 'Flytower Mail' WHERE `app_name` = 'Mailflare';
