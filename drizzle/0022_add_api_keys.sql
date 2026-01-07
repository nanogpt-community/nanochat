CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`key` text NOT NULL UNIQUE,
	`name` text NOT NULL,
	`last_used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `api_keys_user_id_idx` ON `api_keys` (`user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_key_idx` ON `api_keys` (`key`);
