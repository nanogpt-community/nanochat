ALTER TABLE "conversations" ADD COLUMN "compaction_summary" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "compacted_through_message_id" text;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "auto_compact_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "auto_compact_threshold" integer DEFAULT 80 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "memory_model_id" text;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "memory_provider_id" text;--> statement-breakpoint
ALTER TABLE "user_memories" DROP COLUMN "token_count";--> statement-breakpoint
ALTER TABLE "user_memories" DROP COLUMN "expires_at";--> statement-breakpoint
ALTER TABLE "user_settings" DROP COLUMN "context_memory_enabled";--> statement-breakpoint
-- Old rows held a NanoGPT-compressed transcript blob, not discrete facts; the new format starts clean.
DELETE FROM "user_memories";
