CREATE INDEX "conversations_user_updated_idx" ON "conversations" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "messages_model_provider_idx" ON "messages" USING btree ("model_id","provider");--> statement-breakpoint
CREATE INDEX "messages_starred_idx" ON "messages" USING btree ("conversation_id") WHERE "messages"."starred";--> statement-breakpoint
CREATE INDEX "storage_user_id_idx" ON "storage" USING btree ("user_id");