import {
	pgTable,
	text,
	integer,
	boolean,
	timestamp,
	jsonb,
	doublePrecision,
	index,
	uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// ============================================================================
// Better Auth Tables (required by better-auth)
// ============================================================================

export const user = pgTable('user', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').unique(),
	emailVerified: boolean('emailVerified').notNull(),
	image: text('image'),
	createdAt: timestamp('createdAt', { withTimezone: true }).notNull(),
	updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull(),
});

export const session = pgTable('session', {
	id: text('id').primaryKey(),
	expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
	token: text('token').notNull().unique(),
	createdAt: timestamp('createdAt', { withTimezone: true }).notNull(),
	updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull(),
	ipAddress: text('ipAddress'),
	userAgent: text('userAgent'),
	userId: text('userId')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
});

export const account = pgTable('account', {
	id: text('id').primaryKey(),
	accountId: text('accountId').notNull(),
	providerId: text('providerId').notNull(),
	userId: text('userId')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	accessToken: text('accessToken'),
	refreshToken: text('refreshToken'),
	idToken: text('idToken'),
	accessTokenExpiresAt: timestamp('accessTokenExpiresAt', { withTimezone: true }),
	refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt', { withTimezone: true }),
	scope: text('scope'),
	password: text('password'),
	createdAt: timestamp('createdAt', { withTimezone: true }).notNull(),
	updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull(),
});

export const verification = pgTable('verification', {
	id: text('id').primaryKey(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
	createdAt: timestamp('createdAt', { withTimezone: true }),
	updatedAt: timestamp('updatedAt', { withTimezone: true }),
});

export const passkey = pgTable('passkey', {
	id: text('id').primaryKey(),
	name: text('name'),
	publicKey: text('publicKey').notNull(),
	userId: text('userId')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	credentialID: text('credentialID').notNull(),
	aaguid: text('aaguid').notNull(),
	webauthnUserID: text('webauthnUserID'),
	counter: integer('counter').notNull(),
	deviceType: text('deviceType').notNull(),
	backedUp: boolean('backedUp').notNull(),
	transports: text('transports'),
	createdAt: timestamp('createdAt', { withTimezone: true }),
});

export const ssoProvider = pgTable('ssoProvider', {
	id: text('id').primaryKey(),
	issuer: text('issuer').notNull(),
	oidcConfig: text('oidcConfig'),
	samlConfig: text('samlConfig'),
	userId: text('userId').references(() => user.id),
	providerId: text('providerId').notNull().unique(),
	organizationId: text('organizationId'),
	domain: text('domain').notNull(),
});

// ============================================================================
// Application Tables (migrated from Convex)
// ============================================================================

export const userSettings = pgTable(
	'user_settings',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		timezone: text('timezone').notNull().default('UTC'),
		privacyMode: boolean('privacy_mode').notNull().default(false),
		contextMemoryEnabled: boolean('context_memory_enabled').notNull().default(false),
		persistentMemoryEnabled: boolean('persistent_memory_enabled').notNull().default(false),
		youtubeTranscriptsEnabled: boolean('youtube_transcripts_enabled').notNull().default(false),
		webScrapingEnabled: boolean('web_scraping_enabled').notNull().default(false),
		mcpEnabled: boolean('mcp_enabled').notNull().default(false),
		followUpQuestionsEnabled: boolean('follow_up_questions_enabled').notNull().default(true),
		suggestedPromptsEnabled: boolean('suggested_prompts_enabled').notNull().default(true),
		freeMessagesUsed: integer('free_messages_used').default(0),
		dailyMessagesUsed: integer('daily_messages_used').default(0),
		lastMessageDate: text('last_message_date'), // ISO date string (YYYY-MM-DD) for daily reset
		karakeepUrl: text('karakeep_url'),
		karakeepApiKey: text('karakeep_api_key'),
		theme: text('theme'),
		themePrimaryColor: text('theme_primary_color'),
		themeAccentColor: text('theme_accent_color'),
		titleModelId: text('title_model_id'),
		titleProviderId: text('title_provider_id'),
		followUpModelId: text('follow_up_model_id'),
		followUpProviderId: text('follow_up_provider_id'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
	},
	(table) => [index('user_settings_user_id_idx').on(table.userId)]
);

export const userKeys = pgTable(
	'user_keys',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		provider: text('provider').notNull(), // 'openrouter' | 'huggingface' | 'openai' | 'anthropic'
		key: text('key').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
	},
	(table) => [
		index('user_keys_user_id_idx').on(table.userId),
		index('user_keys_provider_user_idx').on(table.provider, table.userId),
	]
);

export const mcpServers = pgTable(
	'mcp_servers',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		name: text('name').notNull(), // also namespaces the tool names exposed to the model
		url: text('url').notNull(),
		authToken: text('auth_token'), // encrypted at rest, sent as `Authorization: Bearer`
		headers: text('headers'), // encrypted JSON object of extra request headers
		enabled: boolean('enabled').notNull().default(true),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
	},
	(table) => [index('mcp_servers_user_id_idx').on(table.userId)]
);

export const userEnabledModels = pgTable(
	'user_enabled_models',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		provider: text('provider').notNull(),
		modelId: text('model_id').notNull(),
		pinned: boolean('pinned'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
	},
	(table) => [
		index('user_enabled_models_user_id_idx').on(table.userId),
		index('user_enabled_models_model_provider_idx').on(table.modelId, table.provider),
		index('user_enabled_models_provider_user_idx').on(table.provider, table.userId),
		index('user_enabled_models_model_provider_user_idx').on(
			table.modelId,
			table.provider,
			table.userId
		),
	]
);

export const apiKeys = pgTable(
	'api_keys',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		key: text('key').notNull().unique(),
		keyHash: text('key_hash'),
		name: text('name').notNull(),
		lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
	},
	(table) => [
		index('api_keys_user_id_idx').on(table.userId),
		uniqueIndex('api_keys_key_hash_unique').on(table.keyHash),
	]
);

export const userRules = pgTable(
	'user_rules',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		attach: text('attach').notNull(), // 'always' | 'manual'
		rule: text('rule').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
	},
	(table) => [
		index('user_rules_user_id_idx').on(table.userId),
		index('user_rules_user_attach_idx').on(table.userId, table.attach),
		index('user_rules_user_name_idx').on(table.userId, table.name),
	]
);

// Projects - folders for organizing chats with custom instructions and shared files
export const projects = pgTable(
	'projects',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		description: text('description'),
		systemPrompt: text('system_prompt'), // Custom instructions for this project
		color: text('color'), // Optional color for sidebar display
		createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
	},
	(table) => [
		index('projects_user_id_idx').on(table.userId),
		index('projects_user_updated_idx').on(table.userId, table.updatedAt),
	]
);

export const conversations = pgTable(
	'conversations',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }),
		pinned: boolean('pinned').default(false),
		generating: boolean('generating').default(false),
		costUsd: doublePrecision('cost_usd'),
		public: boolean('public').default(false),
		branchedFrom: text('branched_from'),
		assistantId: text('assistant_id').references(() => assistants.id),
		projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
		temporary: boolean('temporary').default(false),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
	},
	(table) => [
		index('conversations_user_id_idx').on(table.userId),
		index('conversations_project_id_idx').on(table.projectId),
		// The sidebar list is `where user_id = ? order by updated_at desc`. `projects`
		// already had the equivalent pair, so its absence here looked like an oversight.
		index('conversations_user_updated_idx').on(table.userId, table.updatedAt),
	]
);

export const messages = pgTable(
	'messages',
	{
		id: text('id').primaryKey(),
		conversationId: text('conversation_id')
			.notNull()
			.references(() => conversations.id, { onDelete: 'cascade' }),
		role: text('role').notNull(), // 'user' | 'assistant' | 'system'
		content: text('content').notNull(),
		contentHtml: text('content_html'),
		reasoning: text('reasoning'),
		error: text('error'),
		modelId: text('model_id'),
		provider: text('provider'),
		tokenCount: integer('token_count'),
		// Total generation time for this assistant response in milliseconds
		responseTimeMs: integer('response_time_ms'),
		timeToFirstTokenMs: integer('time_to_first_token_ms'),
		images: jsonb('images').$type<Array<{ url: string; storage_id: string; fileName?: string }>>(),
		documents: jsonb('documents').$type<
			Array<{
				url: string;
				storage_id: string;
				fileName?: string;
				fileType: 'pdf' | 'markdown' | 'text' | 'epub';
			}>
		>(),
		costUsd: doublePrecision('cost_usd'),
		generationId: text('generation_id'),
		webSearchEnabled: boolean('web_search_enabled').default(false),
		reasoningEffort: text('reasoning_effort'), // ReasoningEffort: none | minimal | low | medium | high | xhigh
		annotations: jsonb('annotations').$type<Array<Record<string, unknown>>>(),
		followUpSuggestions: jsonb('follow_up_suggestions').$type<string[] | null>(),
		starred: boolean('starred').default(false),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
	},
	(table) => [
		index('messages_conversation_id_idx').on(table.conversationId),
		// Deliberately NOT a (conversation_id, created_at) composite: conversation reads
		// order by (created_at, <CASE over role>, id), and the CASE expression as the
		// second key means no plain btree can satisfy that ordering. Measured at 3000
		// messages, Postgres sorts either way — the composite would only add write cost.
		// Analytics groups by these two and they were unindexed, making each model's
		// stats a sequential scan of the whole table across all users.
		index('messages_model_provider_idx').on(table.modelId, table.provider),
		// Starred messages are a tiny fraction of rows; a partial index keeps the
		// starred-messages page off a full scan without bloating writes.
		index('messages_starred_idx')
			.on(table.conversationId)
			.where(sql`${table.starred}`),
	]
);

// Storage table for uploaded files (replacing Convex storage)
export const storage = pgTable(
	'storage',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		filename: text('filename').notNull(),
		mimeType: text('mime_type').notNull(),
		size: integer('size').notNull(),
		path: text('path').notNull(), // Local path or S3 key
		createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
	},
	// The gallery and clear-storage endpoints both filter on user_id; without this
	// the table had no indexes at all and every request scanned it globally.
	(table) => [index('storage_user_id_idx').on(table.userId)]
);

// User memories for cross-conversation persistent memory
export const userMemories = pgTable(
	'user_memories',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		content: text('content').notNull(), // Compressed memory content from NanoGPT
		tokenCount: integer('token_count'),
		expiresAt: timestamp('expires_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
	},
	(table) => [index('user_memories_user_id_idx').on(table.userId)]
);

export const assistants = pgTable(
	'assistants',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		systemPrompt: text('system_prompt').notNull(),
		isDefault: boolean('is_default').notNull().default(false),
		defaultModelId: text('default_model_id'),
		defaultWebSearchMode: text('default_web_search_mode'), // 'off' | 'standard' | 'deep'
		defaultWebSearchProvider: text('default_web_search_provider'), // 'linkup' | 'tavily' | 'exa' | 'kagi' | 'perplexity' | 'valyu' | 'brave' | 'brave-pro' | 'brave-research'
		defaultWebSearchExaDepth: text('default_web_search_exa_depth'), // 'fast' | 'auto' | 'neural' | 'deep'
		defaultWebSearchContextSize: text('default_web_search_context_size'), // 'low' | 'medium' | 'high'
		defaultWebSearchKagiSource: text('default_web_search_kagi_source'), // 'web' | 'news' | 'search'
		defaultWebSearchValyuSearchType: text('default_web_search_valyu_search_type'), // 'all' | 'web'
		createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
	},
	(table) => [index('assistants_user_id_idx').on(table.userId)]
);

// Prompts - reusable prompt templates with variables
export const prompts = pgTable(
	'prompts',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		content: text('content').notNull(), // The prompt template text with {{variables}}
		description: text('description'),
		// Variables stored as JSON array: [{name: string, defaultValue?: string, description?: string}]
		variables:
			jsonb('variables').$type<
				Array<{ name: string; defaultValue?: string; description?: string }>
			>(),
		defaultModelId: text('default_model_id'),
		defaultWebSearchMode: text('default_web_search_mode'), // 'off' | 'standard' | 'deep'
		defaultWebSearchProvider: text('default_web_search_provider'),
		appendMode: text('append_mode').notNull().default('replace'), // 'replace' | 'append' | 'prepend'
		createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
	},
	(table) => [index('prompts_user_id_idx').on(table.userId)]
);

// Scheduled tasks - cron/interval/one-off tasks that execute prompts
export const scheduledTasks = pgTable(
	'scheduled_tasks',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		description: text('description'),
		enabled: boolean('enabled').notNull().default(true),
		scheduleType: text('schedule_type').notNull(), // 'cron' | 'interval' | 'once'
		cronExpression: text('cron_expression'),
		intervalSeconds: integer('interval_seconds'),
		runAt: timestamp('run_at', { withTimezone: true }),
		payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
		nextRunAt: timestamp('next_run_at', { withTimezone: true }),
		lastRunAt: timestamp('last_run_at', { withTimezone: true }),
		lastRunStatus: text('last_run_status'), // 'queued' | 'error'
		lastRunError: text('last_run_error'),
		lockedAt: timestamp('locked_at', { withTimezone: true }),
		lockedBy: text('locked_by'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
	},
	(table) => [
		index('scheduled_tasks_user_id_idx').on(table.userId),
		index('scheduled_tasks_next_run_idx').on(table.nextRunAt),
		index('scheduled_tasks_user_next_run_idx').on(table.userId, table.nextRunAt),
	]
);

// Project files - documents attached to a project for context
export const projectFiles = pgTable(
	'project_files',
	{
		id: text('id').primaryKey(),
		projectId: text('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		storageId: text('storage_id')
			.notNull()
			.references(() => storage.id, { onDelete: 'cascade' }),
		fileName: text('file_name').notNull(),
		fileType: text('file_type').notNull(), // 'pdf' | 'markdown' | 'text' | 'epub'
		extractedContent: text('extracted_content'), // Pre-extracted text content for context
		createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
	},
	(table) => [index('project_files_project_id_idx').on(table.projectId)]
);

// Project members - for collaboration/sharing
export const projectMembers = pgTable(
	'project_members',
	{
		id: text('id').primaryKey(),
		projectId: text('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		role: text('role').notNull().default('viewer'), // 'owner' | 'editor' | 'viewer'
		createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
	},
	(table) => [
		index('project_members_project_id_idx').on(table.projectId),
		index('project_members_user_id_idx').on(table.userId),
	]
);

// Performance tracking tables
export const messageRatings = pgTable(
	'message_ratings',
	{
		id: text('id').primaryKey(),
		messageId: text('message_id')
			.notNull()
			.references(() => messages.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		rating: integer('rating'), // 1-5 or null
		thumbs: text('thumbs', { enum: ['up', 'down'] }),
		categories: jsonb('categories').$type<string[]>(), // ['accurate', 'helpful', etc.]
		feedback: text('feedback'), // optional text
		createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
	},
	(table) => [
		index('message_ratings_message_id_idx').on(table.messageId),
		index('message_ratings_user_id_idx').on(table.userId),
	]
);

export const messageInteractions = pgTable(
	'message_interactions',
	{
		id: text('id').primaryKey(),
		messageId: text('message_id')
			.notNull()
			.references(() => messages.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		action: text('action', { enum: ['regenerate', 'edit', 'copy', 'share'] }).notNull(),
		metadata: jsonb('metadata').$type<Record<string, unknown>>(), // store additional context
		createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
	},
	(table) => [
		index('message_interactions_message_id_idx').on(table.messageId),
		index('message_interactions_user_id_idx').on(table.userId),
		index('message_interactions_action_idx').on(table.action),
	]
);

export const modelPerformanceStats = pgTable(
	'model_performance_stats',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		modelId: text('model_id').notNull(),
		provider: text('provider').notNull(),

		// Aggregated stats (updated periodically)
		totalMessages: integer('total_messages').notNull().default(0),
		avgRating: doublePrecision('avg_rating'),
		thumbsUpCount: integer('thumbs_up_count').notNull().default(0),
		thumbsDownCount: integer('thumbs_down_count').notNull().default(0),
		regenerateCount: integer('regenerate_count').notNull().default(0),
		avgResponseTime: doublePrecision('avg_response_time'), // milliseconds
		avgTokens: doublePrecision('avg_tokens'),
		totalCost: doublePrecision('total_cost').notNull().default(0),
		errorCount: integer('error_count').notNull().default(0),

		// Category counts
		accurateCount: integer('accurate_count').notNull().default(0),
		helpfulCount: integer('helpful_count').notNull().default(0),
		creativeCount: integer('creative_count').notNull().default(0),
		fastCount: integer('fast_count').notNull().default(0),
		costEffectiveCount: integer('cost_effective_count').notNull().default(0),

		lastUpdated: timestamp('last_updated', { withTimezone: true }).notNull(),
	},
	(table) => [
		index('model_performance_user_id_idx').on(table.userId),
		index('model_performance_model_provider_idx').on(table.modelId, table.provider),
		index('model_performance_user_model_provider_idx').on(
			table.userId,
			table.modelId,
			table.provider
		),
	]
);

// ============================================================================
// Relations
// ============================================================================

export const userRelations = relations(user, ({ many, one }) => ({
	sessions: many(session),
	accounts: many(account),
	settings: one(userSettings),
	keys: many(userKeys),
	apiKeys: many(apiKeys),
	enabledModels: many(userEnabledModels),
	rules: many(userRules),
	conversations: many(conversations),
	storage: many(storage),
	memories: one(userMemories),
	assistants: many(assistants),
	prompts: many(prompts),
	scheduledTasks: many(scheduledTasks),
	projects: many(projects),
	projectMemberships: many(projectMembers),
	messageRatings: many(messageRatings),
	messageInteractions: many(messageInteractions),
	modelPerformanceStats: many(modelPerformanceStats),
}));

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id],
	}),
}));

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id],
	}),
}));

export const userSettingsRelations = relations(userSettings, ({ one }) => ({
	user: one(user, {
		fields: [userSettings.userId],
		references: [user.id],
	}),
}));

export const userKeysRelations = relations(userKeys, ({ one }) => ({
	user: one(user, {
		fields: [userKeys.userId],
		references: [user.id],
	}),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
	user: one(user, {
		fields: [apiKeys.userId],
		references: [user.id],
	}),
}));

export const userEnabledModelsRelations = relations(userEnabledModels, ({ one }) => ({
	user: one(user, {
		fields: [userEnabledModels.userId],
		references: [user.id],
	}),
}));

export const userRulesRelations = relations(userRules, ({ one }) => ({
	user: one(user, {
		fields: [userRules.userId],
		references: [user.id],
	}),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
	user: one(user, {
		fields: [conversations.userId],
		references: [user.id],
	}),
	messages: many(messages),
	branchedFromConversation: one(conversations, {
		fields: [conversations.branchedFrom],
		references: [conversations.id],
	}),
	assistant: one(assistants, {
		fields: [conversations.assistantId],
		references: [assistants.id],
	}),
	project: one(projects, {
		fields: [conversations.projectId],
		references: [projects.id],
	}),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
	user: one(user, {
		fields: [projects.userId],
		references: [user.id],
	}),
	conversations: many(conversations),
	files: many(projectFiles),
	members: many(projectMembers),
}));

export const projectFilesRelations = relations(projectFiles, ({ one }) => ({
	project: one(projects, {
		fields: [projectFiles.projectId],
		references: [projects.id],
	}),
	storage: one(storage, {
		fields: [projectFiles.storageId],
		references: [storage.id],
	}),
}));

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
	project: one(projects, {
		fields: [projectMembers.projectId],
		references: [projects.id],
	}),
	user: one(user, {
		fields: [projectMembers.userId],
		references: [user.id],
	}),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
	conversation: one(conversations, {
		fields: [messages.conversationId],
		references: [conversations.id],
	}),
	ratings: many(messageRatings),
	interactions: many(messageInteractions),
}));

export const storageRelations = relations(storage, ({ one }) => ({
	user: one(user, {
		fields: [storage.userId],
		references: [user.id],
	}),
}));

export const userMemoriesRelations = relations(userMemories, ({ one }) => ({
	user: one(user, {
		fields: [userMemories.userId],
		references: [user.id],
	}),
}));

export const assistantsRelations = relations(assistants, ({ one }) => ({
	user: one(user, {
		fields: [assistants.userId],
		references: [user.id],
	}),
}));

export const promptsRelations = relations(prompts, ({ one }) => ({
	user: one(user, {
		fields: [prompts.userId],
		references: [user.id],
	}),
}));

export const messageRatingsRelations = relations(messageRatings, ({ one }) => ({
	message: one(messages, {
		fields: [messageRatings.messageId],
		references: [messages.id],
	}),
	user: one(user, {
		fields: [messageRatings.userId],
		references: [user.id],
	}),
}));

export const messageInteractionsRelations = relations(messageInteractions, ({ one }) => ({
	message: one(messages, {
		fields: [messageInteractions.messageId],
		references: [messages.id],
	}),
	user: one(user, {
		fields: [messageInteractions.userId],
		references: [user.id],
	}),
}));

export const modelPerformanceStatsRelations = relations(modelPerformanceStats, ({ one }) => ({
	user: one(user, {
		fields: [modelPerformanceStats.userId],
		references: [user.id],
	}),
}));

// ============================================================================
// Type Exports
// ============================================================================

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Session = typeof session.$inferSelect;
export type NewSession = typeof session.$inferInsert;
export type UserSettings = typeof userSettings.$inferSelect;
export type NewUserSettings = typeof userSettings.$inferInsert;
export type UserKey = typeof userKeys.$inferSelect;
export type NewUserKey = typeof userKeys.$inferInsert;
export type McpServer = typeof mcpServers.$inferSelect;
export type NewMcpServer = typeof mcpServers.$inferInsert;
export type UserEnabledModel = typeof userEnabledModels.$inferSelect;
export type NewUserEnabledModel = typeof userEnabledModels.$inferInsert;
export type UserRule = typeof userRules.$inferSelect;
export type NewUserRule = typeof userRules.$inferInsert;
export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type Storage = typeof storage.$inferSelect;
export type NewStorage = typeof storage.$inferInsert;
export type UserMemory = typeof userMemories.$inferSelect;
export type NewUserMemory = typeof userMemories.$inferInsert;
export type Assistant = typeof assistants.$inferSelect;
export type NewAssistant = typeof assistants.$inferInsert;
export type Prompt = typeof prompts.$inferSelect;
export type NewPrompt = typeof prompts.$inferInsert;
export type MessageRating = typeof messageRatings.$inferSelect;
export type NewMessageRating = typeof messageRatings.$inferInsert;
export type MessageInteraction = typeof messageInteractions.$inferSelect;
export type NewMessageInteraction = typeof messageInteractions.$inferInsert;
export type ModelPerformanceStats = typeof modelPerformanceStats.$inferSelect;
export type NewModelPerformanceStats = typeof modelPerformanceStats.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type ProjectFile = typeof projectFiles.$inferSelect;
export type NewProjectFile = typeof projectFiles.$inferInsert;
export type ProjectMember = typeof projectMembers.$inferSelect;
export type NewProjectMember = typeof projectMembers.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type ScheduledTask = typeof scheduledTasks.$inferSelect;
export type NewScheduledTask = typeof scheduledTasks.$inferInsert;
