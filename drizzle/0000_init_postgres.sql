CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp with time zone,
	"refreshTokenExpiresAt" timestamp with time zone,
	"scope" text,
	"password" text,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"key_hash" text,
	"name" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "api_keys_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "assistants" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"system_prompt" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"default_model_id" text,
	"default_web_search_mode" text,
	"default_web_search_provider" text,
	"default_web_search_exa_depth" text,
	"default_web_search_context_size" text,
	"default_web_search_kagi_source" text,
	"default_web_search_valyu_search_type" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"updated_at" timestamp with time zone,
	"pinned" boolean DEFAULT false,
	"generating" boolean DEFAULT false,
	"cost_usd" double precision,
	"public" boolean DEFAULT false,
	"branched_from" text,
	"assistant_id" text,
	"project_id" text,
	"temporary" boolean DEFAULT false,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_interactions" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"user_id" text NOT NULL,
	"action" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_ratings" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"user_id" text NOT NULL,
	"rating" integer,
	"thumbs" text,
	"categories" jsonb,
	"feedback" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"content_html" text,
	"reasoning" text,
	"error" text,
	"model_id" text,
	"provider" text,
	"token_count" integer,
	"response_time_ms" integer,
	"time_to_first_token_ms" integer,
	"images" jsonb,
	"documents" jsonb,
	"cost_usd" double precision,
	"generation_id" text,
	"web_search_enabled" boolean DEFAULT false,
	"reasoning_effort" text,
	"annotations" jsonb,
	"follow_up_suggestions" jsonb,
	"starred" boolean DEFAULT false,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_performance_stats" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"model_id" text NOT NULL,
	"provider" text NOT NULL,
	"total_messages" integer DEFAULT 0 NOT NULL,
	"avg_rating" double precision,
	"thumbs_up_count" integer DEFAULT 0 NOT NULL,
	"thumbs_down_count" integer DEFAULT 0 NOT NULL,
	"regenerate_count" integer DEFAULT 0 NOT NULL,
	"avg_response_time" double precision,
	"avg_tokens" double precision,
	"total_cost" double precision DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"accurate_count" integer DEFAULT 0 NOT NULL,
	"helpful_count" integer DEFAULT 0 NOT NULL,
	"creative_count" integer DEFAULT 0 NOT NULL,
	"fast_count" integer DEFAULT 0 NOT NULL,
	"cost_effective_count" integer DEFAULT 0 NOT NULL,
	"last_updated" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passkey" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"publicKey" text NOT NULL,
	"userId" text NOT NULL,
	"credentialID" text NOT NULL,
	"aaguid" text NOT NULL,
	"webauthnUserID" text,
	"counter" integer NOT NULL,
	"deviceType" text NOT NULL,
	"backedUp" boolean NOT NULL,
	"transports" text,
	"createdAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "project_files" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"storage_id" text NOT NULL,
	"file_name" text NOT NULL,
	"file_type" text NOT NULL,
	"extracted_content" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"system_prompt" text,
	"color" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"content" text NOT NULL,
	"description" text,
	"variables" jsonb,
	"default_model_id" text,
	"default_web_search_mode" text,
	"default_web_search_provider" text,
	"append_mode" text DEFAULT 'replace' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"schedule_type" text NOT NULL,
	"cron_expression" text,
	"interval_seconds" integer,
	"run_at" timestamp with time zone,
	"payload" jsonb NOT NULL,
	"next_run_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"last_run_status" text,
	"last_run_error" text,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "ssoProvider" (
	"id" text PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"oidcConfig" text,
	"samlConfig" text,
	"userId" text,
	"providerId" text NOT NULL,
	"organizationId" text,
	"domain" text NOT NULL,
	CONSTRAINT "ssoProvider_providerId_unique" UNIQUE("providerId")
);
--> statement-breakpoint
CREATE TABLE "storage" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"path" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"emailVerified" boolean NOT NULL,
	"image" text,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_enabled_models" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"model_id" text NOT NULL,
	"pinned" boolean,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_memories" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"content" text NOT NULL,
	"token_count" integer,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"attach" text NOT NULL,
	"rule" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"privacy_mode" boolean DEFAULT false NOT NULL,
	"context_memory_enabled" boolean DEFAULT false NOT NULL,
	"persistent_memory_enabled" boolean DEFAULT false NOT NULL,
	"youtube_transcripts_enabled" boolean DEFAULT false NOT NULL,
	"web_scraping_enabled" boolean DEFAULT false NOT NULL,
	"mcp_enabled" boolean DEFAULT false NOT NULL,
	"follow_up_questions_enabled" boolean DEFAULT true NOT NULL,
	"suggested_prompts_enabled" boolean DEFAULT true NOT NULL,
	"free_messages_used" integer DEFAULT 0,
	"daily_messages_used" integer DEFAULT 0,
	"last_message_date" text,
	"karakeep_url" text,
	"karakeep_api_key" text,
	"theme" text,
	"theme_primary_color" text,
	"theme_accent_color" text,
	"title_model_id" text,
	"title_provider_id" text,
	"follow_up_model_id" text,
	"follow_up_provider_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone,
	"updatedAt" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistants" ADD CONSTRAINT "assistants_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assistant_id_assistants_id_fk" FOREIGN KEY ("assistant_id") REFERENCES "public"."assistants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_interactions" ADD CONSTRAINT "message_interactions_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_interactions" ADD CONSTRAINT "message_interactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_ratings" ADD CONSTRAINT "message_ratings_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_ratings" ADD CONSTRAINT "message_ratings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_performance_stats" ADD CONSTRAINT "model_performance_stats_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passkey" ADD CONSTRAINT "passkey_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_storage_id_storage_id_fk" FOREIGN KEY ("storage_id") REFERENCES "public"."storage"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD CONSTRAINT "scheduled_tasks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssoProvider" ADD CONSTRAINT "ssoProvider_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage" ADD CONSTRAINT "storage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_enabled_models" ADD CONSTRAINT "user_enabled_models_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_keys" ADD CONSTRAINT "user_keys_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_memories" ADD CONSTRAINT "user_memories_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_rules" ADD CONSTRAINT "user_rules_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_keys_user_id_idx" ON "api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_key_hash_unique" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "assistants_user_id_idx" ON "assistants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "conversations_user_id_idx" ON "conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "conversations_project_id_idx" ON "conversations" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "message_interactions_message_id_idx" ON "message_interactions" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "message_interactions_user_id_idx" ON "message_interactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "message_interactions_action_idx" ON "message_interactions" USING btree ("action");--> statement-breakpoint
CREATE INDEX "message_ratings_message_id_idx" ON "message_ratings" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "message_ratings_user_id_idx" ON "message_ratings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_id_idx" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "model_performance_user_id_idx" ON "model_performance_stats" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "model_performance_model_provider_idx" ON "model_performance_stats" USING btree ("model_id","provider");--> statement-breakpoint
CREATE INDEX "model_performance_user_model_provider_idx" ON "model_performance_stats" USING btree ("user_id","model_id","provider");--> statement-breakpoint
CREATE INDEX "project_files_project_id_idx" ON "project_files" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_members_project_id_idx" ON "project_members" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_members_user_id_idx" ON "project_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "projects_user_id_idx" ON "projects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "projects_user_updated_idx" ON "projects" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "prompts_user_id_idx" ON "prompts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "scheduled_tasks_user_id_idx" ON "scheduled_tasks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "scheduled_tasks_next_run_idx" ON "scheduled_tasks" USING btree ("next_run_at");--> statement-breakpoint
CREATE INDEX "scheduled_tasks_user_next_run_idx" ON "scheduled_tasks" USING btree ("user_id","next_run_at");--> statement-breakpoint
CREATE INDEX "user_enabled_models_user_id_idx" ON "user_enabled_models" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_enabled_models_model_provider_idx" ON "user_enabled_models" USING btree ("model_id","provider");--> statement-breakpoint
CREATE INDEX "user_enabled_models_provider_user_idx" ON "user_enabled_models" USING btree ("provider","user_id");--> statement-breakpoint
CREATE INDEX "user_enabled_models_model_provider_user_idx" ON "user_enabled_models" USING btree ("model_id","provider","user_id");--> statement-breakpoint
CREATE INDEX "user_keys_user_id_idx" ON "user_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_keys_provider_user_idx" ON "user_keys" USING btree ("provider","user_id");--> statement-breakpoint
CREATE INDEX "user_memories_user_id_idx" ON "user_memories" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_rules_user_id_idx" ON "user_rules" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_rules_user_attach_idx" ON "user_rules" USING btree ("user_id","attach");--> statement-breakpoint
CREATE INDEX "user_rules_user_name_idx" ON "user_rules" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "user_settings_user_id_idx" ON "user_settings" USING btree ("user_id");