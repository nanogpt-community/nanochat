CREATE TABLE `user_memories` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`content` text NOT NULL,
	`token_count` integer,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_memories_user_id_idx` ON `user_memories` (`user_id`);--> statement-breakpoint
ALTER TABLE `user_settings` ADD `persistent_memory_enabled` integer DEFAULT false NOT NULL;