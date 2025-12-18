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

export const passkey = sqliteTable("passkey", {
    id: text("id").primaryKey(),
    name: text("name"),
    publicKey: text("publicKey").notNull(),
    userId: text("userId")
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
    webauthnUserID: text("webauthnUserID").notNull(),
    counter: integer("counter").notNull(),
    deviceType: text("deviceType").notNull(),
    backedUp: integer("backedUp", { mode: 'boolean' }).notNull(),
    transports: text("transports"),
    createdAt: integer("createdAt", { mode: 'timestamp' }),
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
        freeMessagesUsed: integer('free_messages_used').default(0),
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
        createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    },
    (table) => [index('conversations_user_id_idx').on(table.userId)]
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
        images: text('images', { mode: 'json' }).$type<
            Array<{ url: string; storage_id: string; fileName?: string }>
        >(),
        costUsd: real('cost_usd'),
        generationId: text('generation_id'),
        webSearchEnabled: integer('web_search_enabled', { mode: 'boolean' }).default(false),
        reasoningEffort: text('reasoning_effort'), // 'low' | 'medium' | 'high'
        annotations: text('annotations', { mode: 'json' }).$type<Array<Record<string, unknown>>>(),
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

// ============================================================================
// Relations
// ============================================================================

export const userRelations = relations(user, ({ many, one }) => ({
    sessions: many(session),
    accounts: many(account),
    settings: one(userSettings),
    keys: many(userKeys),
    enabledModels: many(userEnabledModels),
    rules: many(userRules),
    conversations: many(conversations),
    storage: many(storage),
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
}));

export const messagesRelations = relations(messages, ({ one }) => ({
    conversation: one(conversations, {
        fields: [messages.conversationId],
        references: [conversations.id],
    }),
}));

export const storageRelations = relations(storage, ({ one }) => ({
    user: one(user, {
        fields: [storage.userId],
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
