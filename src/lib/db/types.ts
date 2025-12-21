/**
 * Type compatibility layer for Convex to SQLite migration
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
    Assistant,
    NewAssistant,
} from '$lib/db/schema';

// Table name to type mapping 
type TableTypes = {
    user_settings: import('$lib/db/schema').UserSettings;
    user_keys: import('$lib/db/schema').UserKey;
    user_enabled_models: import('$lib/db/schema').UserEnabledModel;
    user_rules: import('$lib/db/schema').UserRule;
    conversations: import('$lib/db/schema').Conversation;
    messages: import('$lib/db/schema').Message;
    storage: import('$lib/db/schema').Storage;
    user: import('$lib/db/schema').User;
    session: import('$lib/db/schema').Session;
    assistants: import('$lib/db/schema').Assistant;
};

/**
 * Doc<TableName> - Gets the document type for a table
 * Compatible with Convex's Doc<'tableName'> pattern
 */
export type Doc<T extends keyof TableTypes> = TableTypes[T];

/**
 * Id<TableName> - Gets the ID type for a table
 * In our SQLite implementation, all IDs are strings (UUIDs)
 */
export type Id<T extends keyof TableTypes> = string;
