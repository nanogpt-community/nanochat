CREATE TABLE `scheduled_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`enabled` integer DEFAULT true NOT NULL,
	`schedule_type` text NOT NULL,
	`cron_expression` text,
	`interval_seconds` integer,
	`run_at` integer,
	`payload` text NOT NULL,
	`next_run_at` integer,
	`last_run_at` integer,
	`last_run_status` text,
	`last_run_error` text,
	`locked_at` integer,
	`locked_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `scheduled_tasks_user_id_idx` ON `scheduled_tasks` (`user_id`);--> statement-breakpoint
CREATE INDEX `scheduled_tasks_next_run_idx` ON `scheduled_tasks` (`next_run_at`);--> statement-breakpoint
CREATE INDEX `scheduled_tasks_user_next_run_idx` ON `scheduled_tasks` (`user_id`,`next_run_at`);--> statement-breakpoint
ALTER TABLE `user_settings` ADD `timezone` text DEFAULT 'UTC' NOT NULL;