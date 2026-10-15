/**
 * Type compatibility layer for the original Convex migration
 * Provides Doc and Id types that match Convex patterns
 */

// Re-export types from database schema with Convex-compatible naming
export type {
	UserSettings,
	UserKey,
	UserEnabledModel,
	UserRule,
	Conversation,
	Message,
	Storage,
	User,
	Session,
	ScheduledTask,
} from '#lib/db/schema.js';

// Table name to type mapping
type TableTypes = {
	user_settings: import('#lib/db/schema.js').UserSettings;
	user_keys: import('#lib/db/schema.js').UserKey;
	user_enabled_models: import('#lib/db/schema.js').UserEnabledModel;
	user_rules: import('#lib/db/schema.js').UserRule;
	conversations: import('#lib/db/schema.js').Conversation;
	messages: import('#lib/db/schema.js').Message;
	storage: import('#lib/db/schema.js').Storage;
	scheduled_tasks: import('#lib/db/schema.js').ScheduledTask;
	user: import('#lib/db/schema.js').User;
	session: import('#lib/db/schema.js').Session;
};

/**
 * Doc<TableName> - Gets the document type for a table
 * Compatible with Convex's Doc<'tableName'> pattern
 */
export type Doc<T extends keyof TableTypes> = TableTypes[T];

/**
 * Id<TableName> - Gets the ID type for a table
 * In our Postgres implementation, all IDs are strings (UUIDs)
 */
export type Id<T extends keyof TableTypes> = string;
