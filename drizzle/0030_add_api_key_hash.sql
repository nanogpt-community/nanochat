ALTER TABLE `api_keys` ADD `key_hash` text;--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_key_hash_unique` ON `api_keys` (`key_hash`);
