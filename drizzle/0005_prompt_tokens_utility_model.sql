ALTER TABLE "messages" ADD COLUMN "prompt_tokens" integer;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "utility_model_id" text;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "utility_provider_id" text;