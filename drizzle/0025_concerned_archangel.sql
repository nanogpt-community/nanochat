CREATE TABLE `prompts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`content` text NOT NULL,
	`description` text,
	`variables` text,
	`default_model_id` text,
	`default_web_search_mode` text,
	`default_web_search_provider` text,
	`append_mode` text DEFAULT 'replace' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `prompts_user_id_idx` ON `prompts` (`user_id`);--> statement-breakpoint
ALTER TABLE `assistants` ADD `default_web_search_exa_depth` text;--> statement-breakpoint
ALTER TABLE `assistants` ADD `default_web_search_context_size` text;--> statement-breakpoint
ALTER TABLE `assistants` ADD `default_web_search_kagi_source` text;--> statement-breakpoint
ALTER TABLE `assistants` ADD `default_web_search_valyu_search_type` text;