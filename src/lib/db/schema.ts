import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// ============================================================================
// Better Auth Tables (required by better-auth)
// ============================================================================

export const user = sqliteTable('user', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').unique(),
	emailVerified: integer('emailVerified', { mode: 'boolean' }).notNull(),
	image: text('image'),
	createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
	updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
});

export const session = sqliteTable('session', {
	id: text('id').primaryKey(),
	expiresAt: integer('expiresAt', { mode: 'timestamp' }).notNull(),
	token: text('token').notNull().unique(),
	createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
	updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
	ipAddress: text('ipAddress'),
	userAgent: text('userAgent'),
	userId: text('userId')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
});

export const account = sqliteTable('account', {
	id: text('id').primaryKey(),
	accountId: text('accountId').notNull(),
	providerId: text('providerId').notNull(),
	userId: text('userId')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	accessToken: text('accessToken'),
	refreshToken: text('refreshToken'),
	idToken: text('idToken'),
	accessTokenExpiresAt: integer('accessTokenExpiresAt', { mode: 'timestamp' }),
	refreshTokenExpiresAt: integer('refreshTokenExpiresAt', { mode: 'timestamp' }),
	scope: text('scope'),
	password: text('password'),
	createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
	updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
});

export const verification = sqliteTable('verification', {
	id: text('id').primaryKey(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: integer('expiresAt', { mode: 'timestamp' }).notNull(),
	createdAt: integer('createdAt', { mode: 'timestamp' }),
	updatedAt: integer('updatedAt', { mode: 'timestamp' }),
});

export const passkey = sqliteTable('passkey', {
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
	backedUp: integer('backedUp', { mode: 'boolean' }).notNull(),
	transports: text('transports'),
	createdAt: integer('createdAt', { mode: 'timestamp' }),
});

// ============================================================================
// Application Tables (migrated from Convex)
// ============================================================================

export const userSettings = sqliteTable(
	'user_settings',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		privacyMode: integer('privacy_mode', { mode: 'boolean' }).notNull().default(false),
		contextMemoryEnabled: integer('context_memory_enabled', { mode: 'boolean' })
			.notNull()
			.default(false),
		persistentMemoryEnabled: integer('persistent_memory_enabled', { mode: 'boolean' })
			.notNull()
			.default(false),
		youtubeTranscriptsEnabled: integer('youtube_transcripts_enabled', { mode: 'boolean' })
			.notNull()
			.default(false),
		webScrapingEnabled: integer('web_scraping_enabled', { mode: 'boolean' })
			.notNull()
			.default(false),
		mcpEnabled: integer('mcp_enabled', { mode: 'boolean' })
			.notNull()
			.default(false),
		followUpQuestionsEnabled: integer('follow_up_questions_enabled', { mode: 'boolean' })
			.notNull()
			.default(true),
		freeMessagesUsed: integer('free_messages_used').default(0),
		dailyMessagesUsed: integer('daily_messages_used').default(0),
		lastMessageDate: text('last_message_date'), // ISO date string (YYYY-MM-DD) for daily reset
		karakeepUrl: text('karakeep_url'),
		karakeepApiKey: text('karakeep_api_key'),
		theme: text('theme'),
		titleModelId: text('title_model_id'),
		titleProviderId: text('title_provider_id'),
		followUpModelId: text('follow_up_model_id'),
		followUpProviderId: text('follow_up_provider_id'),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
	},
	(table) => [index('user_settings_user_id_idx').on(table.userId)]
);

export const userKeys = sqliteTable(
	'user_keys',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		provider: text('provider').notNull(), // 'openrouter' | 'huggingface' | 'openai' | 'anthropic'
		key: text('key').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
	},
	(table) => [
		index('user_keys_user_id_idx').on(table.userId),
		index('user_keys_provider_user_idx').on(table.provider, table.userId),
	]
);

export const userEnabledModels = sqliteTable(
	'user_enabled_models',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		provider: text('provider').notNull(),
		modelId: text('model_id').notNull(),
		pinned: integer('pinned', { mode: 'boolean' }),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
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

export const apiKeys = sqliteTable(
	'api_keys',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		key: text('key').notNull().unique(),
		name: text('name').notNull(),
		lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
	},
	(table) => [
		index('api_keys_user_id_idx').on(table.userId),
	]
);

export const userRules = sqliteTable(
	'user_rules',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		attach: text('attach').notNull(), // 'always' | 'manual'
		rule: text('rule').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
	},
	(table) => [
		index('user_rules_user_id_idx').on(table.userId),
		index('user_rules_user_attach_idx').on(table.userId, table.attach),
		index('user_rules_user_name_idx').on(table.userId, table.name),
	]
);

// Projects - folders for organizing chats with custom instructions and shared files
export const projects = sqliteTable(
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
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
	},
	(table) => [
		index('projects_user_id_idx').on(table.userId),
		index('projects_user_updated_idx').on(table.userId, table.updatedAt),
	]
);

export const conversations = sqliteTable(
	'conversations',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' }),
		pinned: integer('pinned', { mode: 'boolean' }).default(false),
		generating: integer('generating', { mode: 'boolean' }).default(false),
		costUsd: real('cost_usd'),
		public: integer('public', { mode: 'boolean' }).default(false),
		branchedFrom: text('branched_from'),
		assistantId: text('assistant_id').references(() => assistants.id),
		projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
		temporary: integer('temporary', { mode: 'boolean' }).default(false),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
	},
	(table) => [
		index('conversations_user_id_idx').on(table.userId),
		index('conversations_project_id_idx').on(table.projectId),
	]
);

export const messages = sqliteTable(
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
		images: text('images', { mode: 'json' }).$type<
			Array<{ url: string; storage_id: string; fileName?: string }>
		>(),
		documents: text('documents', { mode: 'json' }).$type<
			Array<{
				url: string;
				storage_id: string;
				fileName?: string;
				fileType: 'pdf' | 'markdown' | 'text' | 'epub';
			}>
		>(),
		costUsd: real('cost_usd'),
		generationId: text('generation_id'),
		webSearchEnabled: integer('web_search_enabled', { mode: 'boolean' }).default(false),
		reasoningEffort: text('reasoning_effort'), // 'low' | 'medium' | 'high'
		annotations: text('annotations', { mode: 'json' }).$type<Array<Record<string, unknown>>>(),
		followUpSuggestions: text('follow_up_suggestions', { mode: 'json' }).$type<string[] | null>(),
		starred: integer('starred', { mode: 'boolean' }).default(false),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
	},
	(table) => [index('messages_conversation_id_idx').on(table.conversationId)]
);

// Storage table for uploaded files (replacing Convex storage)
export const storage = sqliteTable('storage', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	filename: text('filename').notNull(),
	mimeType: text('mime_type').notNull(),
	size: integer('size').notNull(),
	path: text('path').notNull(), // Local path or S3 key
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// User memories for cross-conversation persistent memory
export const userMemories = sqliteTable(
	'user_memories',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		content: text('content').notNull(), // Compressed memory content from NanoGPT
		tokenCount: integer('token_count'),
		expiresAt: integer('expires_at', { mode: 'timestamp' }),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
	},
	(table) => [index('user_memories_user_id_idx').on(table.userId)]
);

export const assistants = sqliteTable(
	'assistants',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		systemPrompt: text('system_prompt').notNull(),
		isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
		defaultModelId: text('default_model_id'),
		defaultWebSearchMode: text('default_web_search_mode'), // 'off' | 'standard' | 'deep'
		defaultWebSearchProvider: text('default_web_search_provider'), // 'linkup' | 'tavily' | 'exa' | 'kagi'
		defaultWebSearchExaDepth: text('default_web_search_exa_depth'), // 'fast' | 'auto' | 'neural' | 'deep'
		defaultWebSearchContextSize: text('default_web_search_context_size'), // 'low' | 'medium' | 'high'
		defaultWebSearchKagiSource: text('default_web_search_kagi_source'), // 'web' | 'news' | 'search'
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
	},
	(table) => [index('assistants_user_id_idx').on(table.userId)]
);

// Project files - documents attached to a project for context
export const projectFiles = sqliteTable(
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
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
	},
	(table) => [index('project_files_project_id_idx').on(table.projectId)]
);

// Project members - for collaboration/sharing
export const projectMembers = sqliteTable(
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
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
	},
	(table) => [
		index('project_members_project_id_idx').on(table.projectId),
		index('project_members_user_id_idx').on(table.userId),
	]
);

// Performance tracking tables
export const messageRatings = sqliteTable(
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
		categories: text('categories', { mode: 'json' }).$type<string[]>(), // ['accurate', 'helpful', etc.]
		feedback: text('feedback'), // optional text
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
	},
	(table) => [
		index('message_ratings_message_id_idx').on(table.messageId),
		index('message_ratings_user_id_idx').on(table.userId),
	]
);

export const messageInteractions = sqliteTable(
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
		metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(), // store additional context
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
	},
	(table) => [
		index('message_interactions_message_id_idx').on(table.messageId),
		index('message_interactions_user_id_idx').on(table.userId),
		index('message_interactions_action_idx').on(table.action),
	]
);

export const modelPerformanceStats = sqliteTable(
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
		avgRating: real('avg_rating'),
		thumbsUpCount: integer('thumbs_up_count').notNull().default(0),
		thumbsDownCount: integer('thumbs_down_count').notNull().default(0),
		regenerateCount: integer('regenerate_count').notNull().default(0),
		avgResponseTime: real('avg_response_time'), // milliseconds
		avgTokens: real('avg_tokens'),
		totalCost: real('total_cost').notNull().default(0),
		errorCount: integer('error_count').notNull().default(0),

		// Category counts
		accurateCount: integer('accurate_count').notNull().default(0),
		helpfulCount: integer('helpful_count').notNull().default(0),
		creativeCount: integer('creative_count').notNull().default(0),
		fastCount: integer('fast_count').notNull().default(0),
		costEffectiveCount: integer('cost_effective_count').notNull().default(0),

		lastUpdated: integer('last_updated', { mode: 'timestamp' }).notNull(),
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
